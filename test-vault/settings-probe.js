(async () => {
  const out = [];
  const ok = (label, pass, detail) =>
    out.push(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? " -> " + detail : ""}`);

  const plugin = app.plugins.plugins["concordance"];
  const tab = app.setting.pluginTabs.find((t) => t.id === "concordance");

  out.push("## 1. LOAD");
  ok("plugin is loaded", !!plugin, plugin && "v" + plugin.manifest.version);
  ok("settings tab is registered", !!tab, tab && tab.constructor.name);
  if (!plugin || !tab) return out.join("\n");
  ok(
    "minAppVersion allows the declarative API",
    plugin.manifest.minAppVersion >= "1.13.0",
    plugin.manifest.minAppVersion,
  );

  out.push("");
  out.push("## 2. DEFINITIONS");
  const defs = tab.getSettingDefinitions();
  ok("getSettingDefinitions is implemented", typeof tab.getSettingDefinitions === "function");
  ok("returns groups", defs.length > 0, defs.length + " groups");
  for (const group of defs) {
    const rows = (group.items || []).map((i) =>
      i.control ? `${i.name} [${i.control.type}:${i.control.key}]` : `${i.name} [render]`,
    );
    out.push(`    ${group.heading}: ${rows.join(", ")}`);
  }
  const keys = defs.flatMap((g) => (g.items || []).filter((i) => i.control).map((i) => i.control.key));
  const stored = Object.keys(plugin.settings);
  const missing = stored.filter((k) => !keys.includes(k));
  ok("every stored setting has a control", missing.length === 0, missing.join(",") || "none missing");

  out.push("");
  out.push("## 3. STORAGE ROUND TRIP");
  const before = {};
  for (const key of keys) before[key] = tab.getControlValue(key);
  try {
    await tab.setControlValue("excludedFolders", "ProbeArchive\nProbeTemplates");
    ok(
      "textarea text becomes a stored array",
      JSON.stringify(plugin.settings.excludedFolders) === '["ProbeArchive","ProbeTemplates"]',
      JSON.stringify(plugin.settings.excludedFolders),
    );
    ok(
      "array reads back as one per line",
      tab.getControlValue("excludedFolders") === "ProbeArchive\nProbeTemplates",
    );
    await tab.setControlValue("autoIndexHeading", "  Probe  ");
    ok("text settings are trimmed", plugin.settings.autoIndexHeading === "Probe");
    const onDisk = await plugin.loadData();
    ok(
      "changes reach data.json",
      JSON.stringify(onDisk.excludedFolders) === '["ProbeArchive","ProbeTemplates"]',
    );
    await tab.setControlValue("missingBlockBehavior", "nonsense");
    ok("dropdown rejects a value outside its union", plugin.settings.missingBlockBehavior === "ask");
  } finally {
    for (const key of keys) await tab.setControlValue(key, before[key]);
  }
  ok(
    "original values restored",
    keys.every((k) => tab.getControlValue(k) === before[k]),
  );

  out.push("");
  out.push("## 4. SETTINGS SEARCH");
  const indexed = Object.values(app.setting.searchIndex.tabs || {}).some((t) => t.id === "concordance");
  ok("tab is in the search index", indexed);
  const queries = ["excluded folders", "start marker", "missing auto-index", "reset settings"];
  const search = app.setting.searchComponent;
  const original = search.getValue();
  try {
    for (const q of queries) {
      search.setValue(q);
      app.setting.onSearchChanged();
      const text = (app.setting.searchResultsEl?.innerText || "").replace(/\n+/g, " / ");
      ok(`"${q}" is findable`, /Concordance/.test(text), text.slice(0, 90));
    }
  } finally {
    search.setValue(original);
    app.setting.onSearchChanged();
  }

  out.push("");
  const failures = out.filter((line) => line.includes("FAIL")).length;
  out.push(`  ${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"} | Concordance v${plugin.manifest.version} | vault ${app.vault.getName()}`);
  return out.join("\n");
})()
