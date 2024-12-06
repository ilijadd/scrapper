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

// Helper funkcija za čekanje
function delay(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
}

async function scrape(url, username) {
  let browser;
  let page;

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        browser = await puppeteer.launch({
          args: ["--disable-setuid-sandbox", "--no-sandbox", "--single-process", "--no-zygote"],
          executablePath: process.env.NODE_ENV === "production" ? process.env.PUPPETEER_EXECUTABLE_PATH : puppeteer.executablePath(),
        });
        
        page = await browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle0' });
        
        await page.waitForSelector('.search-form__input', {timeout: 4000});
        await page.type('.search-form__input', username);
        await page.keyboard.press('Enter');
        
        await page.waitForSelector('.user-info__username-text', { timeout: 30000 });
        
        const posts = await page.$eval('.stats__item:nth-child(1) > span:nth-child(1)', el => el.innerText);
        const followers = await page.$eval('.stats__item:nth-child(2) > span:nth-child(1)', el => el.innerText);
        const following = await page.$eval('.stats__item:nth-child(3) > span:nth-child(1)', el => el.innerText);
        
        const image = await page.$eval('.avatar__image', el => el.src).catch(() => "");
        const fullName = await page.$eval('.user-info__full-name', el => el.innerText).catch(() => "");
        const bio = await page.$eval('.user-info__biography', el => el.innerText).catch(() => "");

        return {
          username,
          posts: posts || 0,
          full_name: fullName,
          followers: followers || 0,
          following: following || 0,
          bio,
          image
        };

      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        if (page) await page.close();
        if (browser) await browser.close();
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    console.error("Scraping failed:", error);
    throw error;
  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
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

    const url = `https://fastdl.app/instagram-anonymously-viewer`;
    const result = await scrape(url, username);
    res.json(result);
  } catch (error) {
    console.error("API Greška:", error);
    res.status(500).json({
      error: "Neuspešan scraping",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// Ostatak koda ostaje isti...
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
