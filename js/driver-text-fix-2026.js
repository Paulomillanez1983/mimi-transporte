const REPLACEMENTS = [
  ["Instal\u00c3\u00a1", "Instal\u00e1"],
  ["m\u00c3\u00a1s", "m\u00e1s"],
  ["r\u00c3\u00a1pido", "r\u00e1pido"],
  ["pod\u00c3\u00a9s", "pod\u00e9s"],
  ["sesi\u00c3\u00b3n", "sesi\u00f3n"],
  ["navegaci\u00c3\u00b3n", "navegaci\u00f3n"],
  ["l\u00c3\u00adnea", "l\u00ednea"],
  ["\u00f0\u0178\u00a7\u00ad", "\uD83E\uDDED"]
];

function fixTextValue(value) {
  let next = String(value || "");
  for (const pair of REPLACEMENTS) {
    next = next.split(pair[0]).join(pair[1]);
  }
  return next;
}

function fixNodeText(root) {
  const target = root || document.body;
  if (!target) return;
  const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    const fixed = fixTextValue(node.nodeValue);
    if (fixed !== node.nodeValue) node.nodeValue = fixed;
  });
}

function fixAttributes(root) {
  const target = root || document.body;
  if (!target || !target.querySelectorAll) return;
  const attrNames = ["aria-label", "title", "placeholder", "alt"];
  target.querySelectorAll("*").forEach((el) => {
    attrNames.forEach((attr) => {
      if (!el.hasAttribute(attr)) return;
      const current = el.getAttribute(attr);
      const fixed = fixTextValue(current);
      if (fixed !== current) el.setAttribute(attr, fixed);
    });
  });
}

function runFix(root) {
  fixNodeText(root);
  fixAttributes(root);
}

function initDriverTextFix() {
  runFix(document.body);
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          node.nodeValue = fixTextValue(node.nodeValue);
          return;
        }
        if (node.nodeType === Node.ELEMENT_NODE) runFix(node);
      });
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.MIMI_DRIVER_TEXT_FIX = { run: () => runFix(document.body) };
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDriverTextFix, { once: true });
} else {
  initDriverTextFix();
}

export { initDriverTextFix };
