const express = require("express");
const puppeteer = require("puppeteer");
require("dotenv").config();
const LimitingMiddleware = require("limiting-middleware");
const cors = require("cors");
const axios = require("axios");
const { timeout } = require("puppeteer");

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: function(origin, callback) {
      if (!origin || checkOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "x-forwarded-for"],
    credentials: false,
  })
);

app.use(
  new LimitingMiddleware({ limit: 10, resetInterval: 86400000 }).limitByIp()
);

function delay(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
}

async function scrape(url, uname) {
  let browser;
  let page;

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        browser = await puppeteer.launch({
          args: [
            "--disable-setuid-sandbox",
            "--no-sandbox",
            "--single-process",
            "--no-zygote",
          ],
          // headless: false,
          executablePath:
            process.env.NODE_ENV === "production"
              ? process.env.PUPPETEER_EXECUTABLE_PATH
              : puppeteer.executablePath(),
        });

        page = await browser.newPage();

        //ODAVDE JE NOVI KOD
        const final = `${url}/${uname}/`;
        await page.goto(final, { waitUntil: "domcontentloaded" });

        await Promise.all([
          page.waitForSelector("h1.profile__nickname", { timeout: 20000 }),
          page.waitForSelector("div.profile__description", { timeout: 20000 }),
          page.waitForSelector("ul.profile__stats li.profile__stats-item", {
            timeout: 20000,
          }),
        ]).catch(() => {
          console.log("Neki elementi se nisu pojavili u predviđenom vremenu");
        });

        let stats;
        let retryCount = 0;
        const maxRetries = 10;
        const retryDelay = 3000; 

        do {
          stats = await page.$$eval(
            "ul.profile__stats li.profile__stats-item span",
            (elements) =>
              elements.map((el) => {
                const text = el.textContent.trim();
                const numbers = text.match(/\d+/g);
                return numbers ? numbers.join("") : "";
              })
          );

          if (stats.every(stat => stat === "0")) {
            console.log(`Svi statovi su 0. Pokušaj ${retryCount + 1}/${maxRetries}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            retryCount++;
          } else {
            break; 
          }
        } while (retryCount < maxRetries);

        const username = await page.$eval("h1.profile__nickname", (el) => {
          const rawText = el.textContent.trim();
          const words = rawText.split(/\s+/);
          return words[0];
        });

        const bio = await page.$eval("div.profile__description", (el) =>
          el.textContent.trim()
        );

        page.waitForSelector("img.profile__avatar-pic", { timeout: 20000 });

        await page.waitForFunction(
          () => {
            const img = document.querySelector("img.profile__avatar-pic");
            return (
              img && img.src && !img.src.startsWith("data:") && img.complete
            );
          },
          { timeout: 20000 }
        );

        const image = await page.$eval(
          "img.profile__avatar-pic",
          (el) => el.src
        );

        const posts = stats[0];
        const followers = stats[1];
        const following = stats[2];

        return { username, bio, posts, followers, following, image };

        /* DOVDE JE NOVI KOD */

        // await page.waitForSelector(".search-form__input", { timeout: 3000 });
        // await page.type(".search-form__input", username);
        // await page.keyboard.press("Enter");

        // await page.waitForSelector(".user-info__username-text", {
        //   timeout: 3000,
        // });

        // const posts = await page.$eval(
        //   ".stats__item:nth-child(1) > span:nth-child(1)",
        //   (el) => el.innerText
        // );
        // const followers = await page.$eval(
        //   ".stats__item:nth-child(2) > span:nth-child(1)",
        //   (el) => el.innerText
        // );
        // const following = await page.$eval(
        //   ".stats__item:nth-child(3) > span:nth-child(1)",
        //   (el) => el.innerText
        // );

        // const image = await page
        //   .$eval(".avatar__image", (el) => el.src)
        //   .catch(() => "");
        // const fullName = await page
        //   .$eval(".user-info__full-name", (el) => el.innerText)
        //   .catch(() => "");
        // const bio = await page
        //   .$eval(".user-info__biography", (el) => el.innerText)
        //   .catch(() => "");

        // return {
        //   username,
        //   posts: posts || 0,
        //   full_name: fullName,
        //   followers: followers || 0,
        //   following: following || 0,
        //   bio,
        //   image,
        // };
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        if (page) await page.close();
        if (browser) await browser.close();
        if (attempt === 8) throw error;
        await new Promise((resolve) => setTimeout(resolve, 3000));
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

    const url = `https://insta-stories-viewer.com`;
    const result = await scrape(url, username);

    // const url = `https://fanhub.pro/instablogs_ig_viewer?username=${username}`;

    // const result = await axios.get(url);
    console.log(result);

    res.json(result);

    // res.json({
    //   username: result.username,
    //   posts: result.total_posts,
    //   followers: result.user_followers,
    //   following: result.user_following,
    //   image: result.user_profile_pic,
    //   bio: "",
    // });
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
    "https://www.igstalks.com",
    "https://igstalks.com",
    "https://igstalks.com/",
    "www.igstalks.com",
    "http://localhost:5173",
    "http://localhost:4200",
  ];

  return allowedOrigins.includes(origin) || true;
}
