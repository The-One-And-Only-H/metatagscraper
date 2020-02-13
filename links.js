const fetch = require("node-fetch");
const xml2js = require("xml2js");
const puppeteer = require("puppeteer");

(async () => {
  try {
    const resp = await fetch("https://www.lickhome.com/sitemap.xml");
    console.log("Fetches sitemap");
    const xml = await resp.text();
    const parser = new xml2js.Parser();
    const doc = parser.parseString(xml, "text/xml");
    const urls = [...doc.getElementsByTagName("loc")].map(
      loc => loc.textContent
    );
    const browser = await puppeteer.launch({ headless: false });
    console.log("Launches puppeteer");
    const page = await browser.newPage();
    await page.goto(urls);
    console.log("Gets URLs");
    // Wait until <meta property="og:title"> has a truthy value for content attribute
    await page.waitForFunction(() => {
      return document
        .querySelector('meta[property="og:title"]')
        .getAttribute("content");
    });
    const html = await page.content();
    console.log(html);
    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
