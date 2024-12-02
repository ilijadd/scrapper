const express = require("express");
const puppeteer = require("puppeteer");
require("dotenv").config();
const LimitingMiddleware = require("limiting-middleware");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

app.use(
  new LimitingMiddleware({ limit: 10, resetInterval: 86400000 }).limitByIp()
);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrape(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
      ],
      executablePath:
        process.env.NODE_ENV === "production"
          ? process.env.PUPPETEER_EXECUTABLE_PATH
          : puppeteer.executablePath(),
    });

    const page = await browser.newPage();
    

    await page.goto(url, { 
      waitUntil: "networkidle2",
      timeout: 30000 
    });
    
    await page.waitForSelector("div > div > div > div > h5", {
      timeout: 30000,
    });

    const profilePic = await page.evaluate(() => {
      const img = document.querySelector('img[alt="profile pic"]');
      return img ? img.src : "";
    });

    const stats = await page.$$eval("div > div > div > div > h5", (elements) =>
      elements.map((el) => el.innerText)
    );

    let bio = "";
    try {
      await page.waitForSelector("div > div > div > div > p", {
        timeout: 5000,
      });
      bio = await page.$eval("div > div > div > div > p", (el) => el.innerText);
    } catch (error) {
      console.log("Bio not found, using empty string");
    }

    const result = {
      username: stats[0],
      posts: parseInt(stats[1].split(" ")[0]),
      full_name: "",
      followers: parseInt(stats[2].split(" ")[0]),
      following: parseInt(stats[3].split(" ")[0]),
      bio: bio,
      image: profilePic,
    };

    return result;
  } catch (error) {
    console.error("Error during scraping:", error);
    throw error; // Propagiramo error umesto vraćanja null
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

app.post("/scrape", async (req, res) => {
  try {
    if (!checkOrigin(req.headers.origin)) {
      return res.status(404).json({ msg: "not allowed" });
    }

    const username = req.body.username;
    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const url = `https://stealthgram.com/profile/${username}`;
    const result = await scrape(url);
    res.json(result);
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ 
      error: "Failed to scrape Instagram",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

function checkOrigin(origin) {
  const allowedOrigins = [
    "https://profile-info.pages.dev",
    "https://instadelete.pages.dev",
    "https://deleted-pics.pages.dev",
    "https://insta-delete.pages.dev",
    "https://find-location.pages.dev",
    "https://insta-deleter.pages.dev",
    "https://insta-savers.pages.dev",
    "https://instalkers.pages.dev",
    "https://blockinsta.pages.dev",
    "https://update-instagram.pages.dev",
    "https://instagram-dm.pages.dev",
    "https://page-creator.pages.dev",
    "https://saved-post.pages.dev",
    "https://profile-picture.pages.dev",
    "https://login-profile.pages.dev",
    "https://photo-recover.pages.dev",
    "https://instablockers.pages.dev",
    "https://instaposts.pages.dev",
    "https://checkstalkers.pages.dev",
    "http://localhost:4200",
  ];

  return allowedOrigins.includes(origin) || true;
}