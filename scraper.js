const fs = require("fs");

const fetch = require("node-fetch");
const puppeteer = require("puppeteer");
const DomParser = require("dom-parser");
const parser = new DomParser();

(async () => {
  // Fetches XML sitemap to loop through URLs
  const resp = await fetch("https://www.lickhome.com/sitemap.xml");
  const xml = await resp.text();
  // Parses XML
  const doc = parser.parseFromString(xml, "text/xml");
  // Creates array of URLs
  const urls = [...doc.getElementsByTagName("loc")].map(loc => loc.textContent);
  // Launch headless browser in puppeteer
  const browser = await puppeteer.launch({ headless: true });
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
    console.log(
      `Fetching those meta tags for you now! ${i + 1}/${urls.length}`
    );
  }
  // Stringify outputted data
  let output = JSON.stringify(results);
  // Produce HTML output of data
  let table = results.map(page => {
    const rows = page.metas.map(meta => {
      if (meta.charSet) {
        return "";
      }
      let first = "";
      if (meta["http-equiv"]) {
        first = meta["http-equiv"];
      }
      if (meta.name) {
        first = meta.name;
      }
      if (meta.property) {
        first = meta.property;
      }
      return `
          <tr>
            <td>${first}</td>
            <td>${meta.content}</td>
          </tr>
        `;
    });
    return `
        <h1>${page.url}</h1>
        <table>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
          ${rows.join("")}
        </table>
      `;
  });
  let html = `
      <!doctype html>
        <html class="no-js" lang="en">
          <head>
            <meta charset="utf-8">
            <title>Meta Tags</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body>
            ${table.join("")}
          </body>
        </html>
      `;
  // Write to JSON file
  fs.writeFileSync("output.json", output, "utf8", function(err) {
    if (err) {
      console.log("An error occured while writing JSON Object to File.");
      return console.log(err);
    }
    console.log("JSON file has been saved.");
  });
  // Write to HTML file
  fs.writeFileSync("output.html", html, "utf8", function(err) {
    if (err) {
      console.log("An error occured while writing HTML to File.");
      return console.log(err);
    }
    console.log("HTML file has been saved.");
  });
  process.exit();
})();
