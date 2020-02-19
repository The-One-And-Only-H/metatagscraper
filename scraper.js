const fs = require("fs");

const fetch = require("node-fetch");
const puppeteer = require("puppeteer");
const DomParser = require("dom-parser");
const parser = new DomParser();

/* TO DO:
1. Tidy code
2. Push to GH
3. Work on accessibility script
4. Set up GL repo for scraper and push
*/

(async () => {
  try {
    // Use XML sitemap to loop through URLs
    const resp = await fetch("https://www.lickhome.com/sitemap.xml");
    console.log("Fetches sitemap");
    const xml = await resp.text();
    // Parse XML
    const doc = parser.parseFromString(xml, "text/xml");
    console.log("Parses XML");
    // Create array of URLs
    const urls = [...doc.getElementsByTagName("loc")].map(
      loc => loc.textContent
    );
    console.log("Creates array of URLs");
    // Launch headless browser in puppeteer
    const browser = await puppeteer.launch({ headless: true });
    console.log("Launches puppeteer");
    const page = await browser.newPage();
    let results = [];
    // Loop through URLs as individual strings rather than as an array
    for (i = 0; i < urls.length; i++) {
      let response = await page.goto(urls[i]);
      let html = await response.text();
      let dom = parser.parseFromString(html);
      // Find and loop through keys within HTML object named meta
      let metaAttribs = [...dom.getElementsByTagName("meta")].map(meta =>
        Object.assign(
          {},
          ...Array.from(meta.attributes, ({ name, value }) => ({
            [name]: value
          }))
        )
      );
      // Return list of URLs with their meta data
      results.push({ url: urls[i], metas: metaAttribs });
      console.log("Gets URL");
    }
    // Stringify outputted data
    let output = JSON.stringify(results);
    // Write to JSON file
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
