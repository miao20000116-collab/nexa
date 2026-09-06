import fs from "fs";

const html = fs.readFileSync("tmp-dy-music.html", "utf8");
const needle = "原声";
let i = 0;
let n = 0;
while ((i = html.indexOf(needle, i)) >= 0 && n < 8) {
  console.log("\n--- hit", n, "at", i, "---");
  console.log(html.slice(Math.max(0, i - 250), i + 450).replace(/\s+/g, " "));
  i += needle.length;
  n += 1;
}

// Also try decode any %22 title near music detail
const m = html.match(/<script id="RENDER_DATA"[^>]*>([^<]+)<\/script>/);
if (m) {
  const raw = decodeURIComponent(m[1]);
  fs.writeFileSync("tmp-dy-music-render.json", raw);
  const j = JSON.parse(raw);
  // dump top keys
  console.log("\nrender top keys", Object.keys(j));
  console.log("app keys", Object.keys(j.app || {}));
  // search in raw string for music fields
  for (const pat of [
    /"title":"([^"]{1,80})"/g,
    /"musicName":"([^"]+)"/g,
    /"shareTitle":"([^"]*)"/g,
    /"author":"([^"]{1,60})"/g,
  ]) {
    const found = [];
    let mm;
    while ((mm = pat.exec(raw)) && found.length < 40) {
      if (
        /原声|周|眉|仙|盆|柯|青|爱|music|Music|@/.test(mm[1]) ||
        mm[1].length < 40
      ) {
        found.push(mm[1]);
      }
    }
    console.log(pat.source, [...new Set(found)].slice(0, 25));
  }
}
