const fs = require("fs");

const fetch = require("node-fetch");
const DomParser = require("dom-parser");
const parser = new DomParser();
const puppeteer = require("puppeteer");

(async () => {
  try {
    const resp = await fetch("https://www.lickhome.com/sitemap.xml");
    console.log("Fetches sitemap");
    const xml = await resp.text();
    const doc = parser.parseFromString(xml, "text/xml");
    console.log("Parses XML");
    const urls = [...doc.getElementsByTagName("loc")].map(
      loc => loc.textContent
    );
    console.log("Creates array of URLs");
    const browser = await puppeteer.launch({ headless: true });
    console.log("Launches puppeteer");
    const page = await browser.newPage();
    let results = [];
    // Loop through URLs as individual strings rather than as an array
    for (i = 0; i < urls.length; i++) {
      let response = await page.goto(urls[i]);
      let html = await response.text();
      // console.log("URL:", url);
      let dom = parser.parseFromString(html);
      let metaAttribs = [...dom.getElementsByTagName("meta")].map(meta =>
        Object.assign(
          {},
          ...Array.from(meta.attributes, ({ name, value }) => ({
            [name]: value
          }))
        )
      );
      results.push({ url: urls[i], metas: metaAttribs });
      console.log("Gets URLs");
    }
    // Wait until <meta property="og:title"> has a truthy value for content attribute
    await page.waitForFunction(() => {
      return document
        .querySelector('meta[property="og:title"]')
        .getAttribute("content");
    });
    const html = await page.content();
    console.log(html);
    let output = JSON.stringify(results);
    fs.writeFileSync("output.json", output, "utf8", function(err) {
      if (err) {
        console.log("An error occured while writing JSON Object to File.");
        return console.log(err);
      }
      console.log("JSON file has been saved.");
    });
    await browser.close();
  } catch (e) {
    console.log(e);
  }
})();
