const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scrape(url, username) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      devtools: true,
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });

    await page.type('form > input', username);
    await page.keyboard.press('Enter')

    const values = {
        num_of_posts: 'div > ul > li:nth-child(1) > span:nth-child(1)',
        followed: 'div > ul > li:nth-child(2) > span:nth-child(1)',
        following: 'div > ul > li:nth-child(3) > span:nth-child(1)',
    }

    const img_selector = '.avatar__image'
    const name_selector = '.user-info__full-name'
    const bio_selector = '.user-info__biography'

    const results = {}
    
    for(key in values){
        const selector = values[key]
        await page.waitForSelector(selector, { timeout: 30000 });
        const element = await page.$(selector)
        if(element){
            const textProperty = await element.getProperty("textContent");
            results[key] = await textProperty.jsonValue()
        }
    }

    const img_element = await page.$(img_selector)
    if(img_element){
        const srcProperty = await img_element.getProperty('src')
        const img = await srcProperty.jsonValue()
        results['image'] = img
    }

    const name_element = await page.$(name_selector)
    if(name_element){
        const textProperty = await name_element.getProperty('textContent')
        const name = await textProperty.jsonValue()
        results['full_name'] = name
    }

    const bio_element = await page.$(bio_selector)
    if(bio_element){
        const textProperty = await bio_element.getProperty('textContent')
        const bio = await textProperty.jsonValue()
        results['bio'] = bio
    }

    return results;
  } catch (error) {
    console.error("Error during scraping:", error);
    return null;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

app.post("/scrape", async (req, res) => {
  const { username } = req.body;
  const url = "https://gramsnap.com/en/inflact/";

  if (!username) {
    return res.status(400).send({ error: "Username is required" });
  }

  const results = await scrape(url, username);

  if (results) {
    res.json({ ...results });
  } else {
    res.status(500).send({ error: "Failed to scrape Instagram" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
