(() => {
  const mc = app.metadataCache, fm = app.fileManager, v = app.vault;
  const out = [];
  const R = (link, src) => {
    const f = mc.getFirstLinkpathDest(link, src);
    return f ? f.path : "(unresolved)";
  };
  out.push("## 1. RESOLUTION  getFirstLinkpathDest(link, source)");
  const cases = [
    ["A exact issue-17 case", "afolder/amarkdowndoc", "A/mytheme/index.md"],
    ["A with ./ prefix",      "./afolder/amarkdowndoc","A/mytheme/index.md"],
    ["A absolute",            "A/mytheme/afolder/amarkdowndoc","A/mytheme/index.md"],
    ["B root twin exists",    "afolder/bdoc",         "B/mytheme/index.md"],
    ["B with ./ prefix",      "./afolder/bdoc",       "B/mytheme/index.md"],
    ["C myafolder segment",   "afolder/cdoc",         "C/index.md"],
    ["C with ./ prefix",      "./afolder/cdoc",       "C/index.md"],
    ["D index outside folder","afolder/ddoc",         "D/inbox/index.md"],
    ["D with ../",            "../mytheme/afolder/ddoc","D/inbox/index.md"],
  ];
  for (const [label, link, src] of cases)
    out.push(`  ${label.padEnd(26)} [[${link}]]`.padEnd(70) + " -> " + R(link, src));

  out.push("");
  out.push("## 2. GENERATION  fileToLinktext / generateMarkdownLink per New link format");
  const origFmt = v.getConfig("newLinkFormat");
  const origMd  = v.getConfig("useMarkdownLinks");
  const gen = [
    ["subfolder file", "A/mytheme/afolder/amarkdowndoc.md", "A/mytheme/index.md"],
    ["sibling file",   "A/mytheme/somedoc.md",              "A/mytheme/index.md"],
    ["index outside",  "D/mytheme/afolder/ddoc.md",         "D/inbox/index.md"],
  ];
  try {
    for (const fmt of ["shortest", "relative", "absolute"]) {
      v.setConfig("newLinkFormat", fmt);
      out.push(`  newLinkFormat = ${fmt}`);
      for (const [label, target, src] of gen) {
        const tf = v.getAbstractFileByPath(target);
        if (!tf) { out.push(`    ${label}: MISSING ${target}`); continue; }
        v.setConfig("useMarkdownLinks", false);
        const wiki = fm.generateMarkdownLink(tf, src);
        v.setConfig("useMarkdownLinks", true);
        const md = fm.generateMarkdownLink(tf, src);
        const raw = mc.fileToLinktext(tf, src, true);
        out.push(`    ${label.padEnd(16)} linktext=${JSON.stringify(raw).padEnd(38)} wiki=${wiki.padEnd(40)} md=${md}`);
      }
    }
  } finally {
    v.setConfig("newLinkFormat", origFmt);
    v.setConfig("useMarkdownLinks", origMd);
  }
  out.push("");
  out.push(`  (restored newLinkFormat=${v.getConfig("newLinkFormat")} useMarkdownLinks=${v.getConfig("useMarkdownLinks")})`);
  out.push(`  Obsidian ${app.appVersion || "?"} | vault ${v.getName()} | ${v.getMarkdownFiles().length} notes`);
  return out.join("\n");
})()
