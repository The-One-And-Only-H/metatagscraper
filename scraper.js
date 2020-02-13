const fs = require("fs");

const fetch = require("node-fetch");
const DomParser = require("dom-parser");
const parser = new DomParser();
const puppeteer = require("puppeteer");
// const { Parser } = require("htmlparser2");
// const { DomHandler } = require("domhandler");

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
      let url = await page.goto(urls[i]);
      console.log("URL:", url);
      let metas = await extractMetaFromDOM(url);
      results.push({ url: urls[i], metas: metas });
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

// Extract all meta tag data from the DOM
const extractMetaFromDOM = url => {
  let response = [];
  parsedUrl = JSON.parse(url);
  parsedUrl.forEach(node => {
    if (node.name === "html") {
      const head = node.children.find(c => c.name === "head");
      const meta = head.children.filter(c => c.name === "meta");
      meta.forEach(elem => response.push(elem.attribs));
    }
  });
  return response;
};

/* 
   1. a) Get sitemap for Lick (create new file to loop through URLs - add URLs to script) - DONE
      b) Loop through each entry in sitemap and get HTML for each as a string like below variable - DONE
   2. For each string, call writeJSONObjectToFile (rename)
   3. Set up Express server in Node, create HTML page that browses outputted JSON (see Express's website for example)
*/

/* Write JSON data as file

* @param input

*/

// const writeJSONObjectToFile = input => {
//   let response = "";

//   const cb = (error, dom) => {
//     if (error) {
//       // Handle error
//       console.error(error);
//     } else {
//       // Parsing completed
//       const clone = [...dom];

//       response = extractMetaFromDOM(clone);

//       var output = JSON.stringify(response);

//       fs.writeFileSync("output.json", output, "utf8", function(err) {
//         if (err) {
//           console.log("An error occured while writing JSON Object to File.");
//           return console.log(err);
//         }
//         console.log("JSON file has been saved.");
//       });
//     }
//   };

//   const handler = new DomHandler(cb);
//   const parser = new Parser(handler);

//   parser.write(input);
//   parser.end();

//   // ---

//   return response;
// };

// raw.forEach(val => {
//   const parsed = writeJSONObjectToFile(val);
//   console.info(parsed);
//   console.info("---");
// });
