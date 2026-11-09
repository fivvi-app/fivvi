/* Fivvi website proposal: hash routes (home, the audiences, #prijzen, #demo, #support, the legal pages, #richting), Dutch and English, light and dark. */
(function () {
  var C = window.COPY, UI = C.UI, A = C.A, ORDER = C.ORDER, P = window.PAGES;
  var EXTRA = ["richting", "prijzen", "demo", "support", "account-verwijderen", "privacy", "voorwaarden", "subverwerkers"];
  var root = document.documentElement;
  var page = document.getElementById("page"), nav = document.getElementById("nav"), foot = document.getElementById("foot"), review = document.getElementById("review");
  var S = { lang: "nl", who: "gym", kind: "pilates", demo: 0, plat: "pro" };
  try { S.lang = localStorage.getItem("fivvi-site-lang") || "nl"; } catch (e) { /* storage unavailable */ }

  function t(x) { return x[S.lang === "en" ? 1 : 0]; }
  function mode() {
    var d = root.getAttribute("data-theme");
    if (d === "dark" || d === "light") return d;
    return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function route() { var h = location.hash.replace("#", ""); return A[h] || EXTRA.indexOf(h) > -1 ? h : "home"; }
  /* open values the owner still gives show as a mark */
  function marks(x) { return x.replace(/\{\{([^}]+)\}\}/g, "<mark>$1</mark>"); }
  function shotSrc(id) { return "assets/shots/" + id + "-" + S.lang + "-" + mode() + ".webp"; }
  function kindShot(id) { return id.slice(-5) === "-kind" ? id.slice(0, -4) + S.kind : id; }
  function img(id, eager) {
    id = kindShot(id);
    return '<img data-shot="' + id + '" src="' + shotSrc(id) + '" alt="' + (C.SHOTS[id] ? t(C.SHOTS[id]) : "") + '"' + (eager ? "" : ' loading="lazy"') + ">";
  }
  function device(id, cls, eager) {
    id = kindShot(id);
    if (id.indexOf("web-") === 0) return '<div class="browser ' + (cls || "") + '">' + img(id, eager) + "</div>";
    return '<div class="phone ' + (id.indexOf("android") > -1 ? "android " : "") + (cls || "") + '">' + img(id, eager) + "</div>";
  }
  /* An audience's image stands on its own and is never a background (owner). */
  var ART_KEY = { gym: "gym", pt: "pt", klanten: "client" };
  function art(k) {
    return '<img class="art" src="../../../apps/web/public/site-images/scenes/' + (ART_KEY[k] || S.kind) + '-800.webp" alt="" loading="lazy">';
  }

  /* The brand's wordmark, the same files the site serves (docs/design/brand): letters #1C1C1E in light, white in dark, the i dots in pink, as drawn. The theme decides which of the two shows (site.css). The label is the site's (site.logo.homeLabel). */
  function wordmark(h) {
    var base = "../../../apps/web/public/site-images/brand/fivvi-logo", w = Math.round(h * 1178 / 459);
    var alt = S.lang === "en" ? "Fivvi, go to the home page" : "Fivvi, naar de startpagina";
    return '<img class="logo logo-light" src="' + base + '.svg" width="' + w + '" height="' + h + '" alt="' + alt + '">' +
      '<img class="logo logo-dark" src="' + base + '-dark.svg" width="' + w + '" height="' + h + '" alt="" aria-hidden="true">';
  }

  function colour(k) { return { priv: "var(--priv)", group: "var(--group)", ok: "var(--ok)", accent: "var(--accent)" }[k]; }
  function who(s) { return s.split("{who}").join(S.kind === "yoga" ? (S.lang === "en" ? "teacher" : "docent") : (S.lang === "en" ? "instructor" : "instructeur")); }

  function renderNav() {
    var r = route();
    nav.innerHTML = '<div class="wrap"><div class="bar"><a class="mark" href="#">' + wordmark(28) + '</a><nav class="links">' +
      ORDER.map(function (k) { return '<a href="#' + k + '"' + (r === k ? ' aria-current="page"' : "") + ">" + t(A[k].nav) + "</a>"; }).join("") +
      '<a href="#prijzen"' + (r === "prijzen" ? ' aria-current="page"' : "") + ">" + t(P.nav.pricing) + "</a>" +
      '<span class="signin onphone">' + t(P.nav.login) + "</span>" +
      '</nav><div class="lang" role="group" aria-label="Taal / Language"><button data-lang="nl" aria-pressed="' + (S.lang === "nl") + '">NL</button><button data-lang="en" aria-pressed="' + (S.lang === "en") + '">EN</button></div><span class="signin">' + t(P.nav.login) + '</span><a class="btn primary small" href="#demo">' + t(P.nav.demo) + "</a></div></div>";
    review.innerHTML = "<b>" + t(UI.proposal) + '</b><a href="#richting">' + t(UI.openChoices) + '</a><button data-theme-toggle>' + (mode() === "dark" ? t(UI.light) : t(UI.dark)) + "</button>";
    var F = P.foot;
    function col(h, items) { return "<div><h2>" + t(h) + "</h2>" + items.map(function (i) { return '<a href="#' + i[0] + '">' + t(i[1]) + "</a>"; }).join("") + "</div>"; }
    foot.innerHTML = '<div class="wrap"><div class="fcols"><div class="fbrand"><a class="mark" href="#">' + wordmark(24) + '</a><p>' + t(P.biz.name) + "<br>KvK " + marks(P.biz.lines[0][1]) + " · " + (S.lang === "en" ? "VAT " : "Btw ") + marks(P.biz.lines[1][1]) + "<br>" + marks(P.biz.lines[2][1]) + "</p></div>" +
      col(F.product, ORDER.map(function (k) { return [k, A[k].nav]; }).concat([["prijzen", P.nav.pricing]])) +
      col(F.help, [["demo", P.nav.demo], ["support", F.support], ["account-verwijderen", F.del]]) +
      col(F.legal, [["privacy", F.privacy], ["voorwaarden", F.terms], ["privacy", F.cookies], ["subverwerkers", F.sub]]) +
      '</div><p class="fine">' + t(UI.foot) + "</p></div>";
  }

  function statusLine() { return '<p class="statusline"><i></i>' + t(P.status) + "</p>"; }

  function stage() {
    var s = A[S.who].stage;
    if (s.web) return '<div class="swap mix">' + device(s.web, "", true) + '<div class="cell">' + device(s.phone, "", true) + "</div></div>";
    return '<div class="swap row">' + s.phones.map(function (id) { return device(id, "", true); }).join("") + "</div>";
  }

  function chain() {
    var d = S.demo, u = 3 + (d >= 3 ? 1 : 0), p = d === 2 ? 1 : 0, l = 7 - (d >= 2 ? 1 : 0);
    var steps = UI.steps.map(function (s, i) {
      /* paid and invoiced come first; then the booking (3), attendance (4) and balance (5) move with the demo */
      var cls = "", mark = i + 1, done = i <= 2 || (i === 3 && d >= 2) || (i >= 4 && d >= 3);
      if (done) { cls = "done"; mark = "✓"; }
      if ((d === 1 && i === 3) || (d === 2 && i === 4)) cls = "live";
      return '<li class="' + cls + '"><span class="dot">' + mark + "</span><div><b>" + t(s[0]) + '</b><span class="d">' + t(s[1]) + "</span></div></li>";
    }).join("");
    var action = "";
    if (d === 0) action = '<button class="btn primary" data-demo="1">' + t(UI.book) + "</button>";
    if (d === 1) action = '<div class="confirm"><span>' + t(UI.confirmText) + '</span><button class="btn primary" data-demo="2">' + t(UI.confirm) + '</button><button class="btn tonal" data-demo="0">' + t(UI.back) + "</button></div>";
    if (d === 2) action = '<button class="btn primary" data-demo="3">' + t(UI.attend) + "</button>";
    if (d === 3) action = '<button class="btn tonal" data-demo="0">' + t(UI.again) + "</button>";
    var say = d === 3 ? UI.say2 : d === 2 ? UI.say1 : UI.say0;
    return '<ol class="steps" id="steps" style="list-style:none;margin:0;padding:0">' + steps + '</ol><div class="demo" id="demo"><h3>' + t(UI.demoTitle) + '</h3><div class="classrow"><span class="t">18:00</span><span class="b"></span><div><b>' + t(UI.demoClass) + "</b><small>" + t(UI.demoWhen) + '</small></div></div><div class="tiles"><div class="tile hot"><b>' + l + "</b><span>" + t(UI.left) + '</span></div><div class="tile"><b>' + p + "</b><span>" + t(UI.planned) + '</span></div><div class="tile"><b>' + u + "</b><span>" + t(UI.used) + '</span></div></div><div class="bar3" aria-hidden="true"><i class="u" style="width:' + u * 10 + '%"></i><i class="p" style="width:' + p * 10 + '%"></i><i class="l" style="width:' + l * 10 + '%"></i></div><p class="say" aria-live="polite">' + t(say) + "</p>" + action + "</div>";
  }

  function cta() {
    /* the pricing page doesn't link to itself */
    var price = route() === "prijzen" ? "" : '<a class="btn tonal" href="#prijzen">' + t(P.cta.price) + "</a>";
    return '<div class="wrap"><div class="cta"><div><h2>' + t(P.cta.h) + "</h2><p>" + t(P.cta.p) + '</p></div><div class="ctabtns"><a class="btn primary" href="#demo">' + t(P.cta.b) + "</a>" + price + "</div></div></div>";
  }

  function home() {
    var a = A[S.who];
    return '<div class="wrap hero"><div class="herogrid"><div><h1>' + t(UI.tagline) + '</h1><p class="lead">' + t(UI.heroLead) + "</p>" + statusLine() + '<div class="who"><p id="who-l">' + t(UI.iam) + '</p><div class="seg" role="group" aria-labelledby="who-l">' +
      ORDER.map(function (k) { return '<button data-who="' + k + '" aria-pressed="' + (S.who === k) + '">' + t(A[k].who) + "</button>"; }).join("") +
      '</div></div></div><div class="heroart" id="heroart">' + art(S.who) + '</div></div><div class="herocopy" id="herocopy"><p>' + t(a.short) + '</p><a class="link" href="#' + S.who + '">' + t(UI.see) + ' →</a></div><div class="stage" id="stage">' + stage() + "</div></div>" +
      '<section><div class="wrap"><p class="eyebrow">' + t(UI.onePlaceEye) + '</p><h2 class="h2">' + t(UI.onePlaceH) + '</h2><p class="lead" style="margin-top:14px">' + t(UI.onePlaceLead) + '</p><div class="oneplace"><ul class="scatter">' +
      UI.scattered.map(function (s) { return "<li><s>" + t(s) + '</s><span class="tick">' + t(UI.gone) + "</span></li>"; }).join("") +
      '<li class="now"><span>' + t(UI.oneRow) + '</span><span class="tick">' + t(UI.oneRowD) + "</span></li></ul>" + device("web-agenda") + "</div></div></section>" +
      '<section><div class="wrap"><p class="eyebrow">' + t(UI.chainEye) + '</p><h2 class="h2">' + t(UI.chainH) + '</h2><p class="lead" style="margin-top:14px">' + t(UI.chainLead) + '</p><div class="chain" id="chain">' + chain() + "</div></div></section>" +
      '<section><div class="wrap"><p class="eyebrow">' + t(UI.forEye) + '</p><h2 class="h2">' + t(UI.forH) + '</h2><p class="lead" style="margin-top:14px">' + t(UI.forLead) + '</p><div class="cards">' +
      ORDER.map(function (k) { return '<a class="acard" href="#' + k + '">' + art(k) + "<div><h3>" + t(A[k].cardH) + "</h3><p>" + t(A[k].short) + '</p><span class="link">' + t(UI.readDay) + " →</span></div></a>"; }).join("") +
      "</div></div></section>" +
      '<section><div class="wrap"><p class="eyebrow">' + t(UI.platEye) + '</p><h2 class="h2">' + t(UI.platH) + '</h2><p class="lead" style="margin-top:14px">' + t(UI.platLead) + '</p><div class="who"><div class="seg" role="group" aria-label="' + t(UI.plat.pro.name) + " / " + t(UI.plat.client.name) + '">' + ["pro", "client"].map(function (k) { return '<button data-plat="' + k + '" aria-pressed="' + (S.plat === k) + '">' + t(UI.plat[k].name) + "</button>"; }).join("") + '</div></div><div id="devices">' + devices() + "</div>" +
      "</div></section>" + promises() + cta();
  }

  function devices() {
    var p = UI.plat[S.plat];
    return '<div class="bento" style="--c:' + colour(p.colour) + '">' + p.items.map(function (i) { return '<article class="bcard' + (i[3] ? " wide" : "") + '"><div class="btxt"><h3>' + t(i[1]) + "</h3><p>" + t(i[2]) + '</p></div><div class="bvis">' + device(i[0]) + "</div></article>"; }).join("") + "</div>";
  }

  function promises() {
    return '<section><div class="wrap"><p class="eyebrow">' + t(UI.promisesEye) + '</p><h2 class="h2">' + t(UI.promisesH) + '</h2><ul class="inset">' +
      UI.promises.map(function (p) { return "<li><b>" + t(p[0]) + "</b><span>" + t(p[1]) + "</span></li>"; }).join("") + "</ul></div></section>";
  }

  function audience(k) {
    var a = A[k], isStudio = k === "studio";
    var phone = isStudio ? "pro-today-" + S.kind : a.heroPhone;
    var kindSeg = isStudio ? '<div class="who"><p id="kind-l">' + t(UI.kindLabel) + '</p><div class="seg" role="group" aria-labelledby="kind-l">' + ["pilates", "yoga"].map(function (x) { return '<button data-kind="' + x + '" aria-pressed="' + (S.kind === x) + '">' + t(UI[x]) + "</button>"; }).join("") + "</div></div>" : "";
    var screens = a.heroWeb ? '<div class="swap mix">' + device(a.heroWeb, "", true) + '<div class="cell">' + device(phone, "", true) + "</div></div>" : '<div class="swap row">' + a.stage.phones.map(function (id) { return device(id, "", true); }).join("") + "</div>";
    return '<div class="wrap hero ahero"><div class="herogrid"><div><p class="eyebrow">' + t(a.cardH) + '</p><h1 style="margin-top:8px">' + t(a.h1) + '</h1><p class="lead">' + t(a.lead) + "</p>" + statusLine() + kindSeg + '</div><div class="heroart">' + art(k) + '</div></div><div class="stage">' + screens + "</div></div>" +
      '<section style="padding-top:clamp(20px,4vw,48px)"><div class="wrap"><h2 class="h2">' + t(UI.recognise) + '</h2><ul class="pains">' + a.pains.map(function (p) { return "<li>" + t(p) + "</li>"; }).join("") + "</ul></div></section>" +
      '<section><div class="wrap"><p class="eyebrow">' + t(UI.dayEye) + '</p><p class="lead" style="margin-top:6px;color:var(--ink);font-weight:500">' + t(UI.dayLead) + '</p><div class="day">' +
      a.day.map(function (m) {
        return '<article class="mom' + (m[5].indexOf("web-") === 0 ? " wide" : "") + '" style="--c:' + colour(m[1]) + '"><div class="txt"><span class="time">' + m[0] + '</span><span class="rule"></span><div class="body"><h3 class="q">' + who(t(m[2])) + '</h3><p class="a">' + who(t(m[3])) + "</p><ul>" + m[4].map(function (x) { return "<li><span>" + t(x) + "</span></li>"; }).join("") + '</ul></div></div><div class="vis">' + device(m[5]) + "</div></article>";
      }).join("") + "</div></div></section>" + promises() + cta();
  }

  function direction() {
    var D = C.DIRECTION;
    return '<div class="wrap hero ahero"><p class="eyebrow">' + t(UI.direction) + '</p><h1 style="margin-top:8px">' + t(D.h1) + '</h1><p class="lead">' + t(D.lead) + '</p><div class="dgrid">' +
      D.cards.map(function (c) { return '<div class="dcard"><h3>' + t(c[0]) + "</h3><p>" + t(c[1]) + "</p></div>"; }).join("") +
      '</div><div class="dgrid"><div class="dcard"><h3>' + (S.lang === "en" ? "Colour" : "Kleur") + '</h3><div class="swatches"><i style="background:#F2F2F7"></i><i style="background:#FFFFFF"></i><i style="background:#000000"></i><i style="background:#1C1C1E"></i><i style="background:#E6164A"></i><i style="background:#0088FF"></i><i style="background:#CB30E0"></i><i style="background:#34C759"></i></div></div><div class="dcard"><h3>' + (S.lang === "en" ? "Type" : "Letter") + '</h3><div class="typeA">Vandaag</div><div class="typeB">07:30</div></div><div class="dcard"><h3>' + (S.lang === "en" ? "Corners and frames" : "Hoeken en lijsten") + "</h3><p>" + (S.lang === "en" ? "Radius 26 on every card, pills for every button, and iPhone, Android and laptop frames around real screens." : "Radius 26 op elke kaart, pillen voor elke knop, en iPhone-, Android- en laptoplijsten om echte schermen.") + "</p></div></div></div>" + directionMore() + '<section><div class="wrap"><h2 class="h2">' + t(D.assumeH) + '</h2><ol class="olist" style="list-style:none;padding:0">' + D.assume.map(function (o) { return "<li><div><b>" + t(o[0]) + "</b><span>" + t(o[1]) + "</span></div></li>"; }).join("") + "</ol></div></section>";
  }

  function head(eye, h1, lead) { return '<div class="wrap hero ahero"><p class="eyebrow">' + t(eye) + '</p><h1 style="margin-top:8px">' + t(h1) + "</h1>" + (lead ? '<p class="lead">' + t(lead) + "</p>" : "") + statusLine(); }

  function pricing() {
    var X = P.pricing;
    return head(X.eye, X.h1, X.lead) + '<div class="plan"><div><h2>' + t(X.name) + '</h2><p class="big num">' + X.big + '</p><p class="sub">' + t(X.sub) + '</p></div><ul class="ticks">' + X.items.map(function (i) { return "<li><span>" + t(i) + "</span></li>"; }).join("") +
      '</ul></div><h2 class="faqh">' + t(X.qaH) + '</h2><div class="faq three">' + X.qa.map(function (q) { return "<article><h3>" + t(q[0]) + "</h3><p>" + t(q[1]) + "</p></article>"; }).join("") + '</div><p class="small" style="margin-top:14px">' + t(X.terms) + "</p></div>" + cta();
  }

  function demo() {
    var X = P.demo;
    function opts(list) { return list.map(function (o, i) { return '<option value="' + i + '">' + t(o) + "</option>"; }).join(""); }
    return head(X.eye, X.h1, X.lead) + '<div class="demogrid"><ol class="olist" style="list-style:none;padding:0;margin-top:0">' + X.steps.map(function (s) { return "<li><div><b>" + t(s[0]) + "</b><span>" + t(s[1]) + "</span></div></li>"; }).join("") +
      '</ol><form class="demoform" id="demo-form" novalidate><div><label for="d-name">' + t(X.name) + '</label><input id="d-name" type="text" autocomplete="off"></div><div><label for="d-email">' + t(X.email) + '</label><input id="d-email" type="email" autocomplete="off" placeholder="naam@example.com"></div><div class="two"><div><label for="d-who">' + t(X.who) + '</label><select id="d-who">' + opts(X.whoOpts) + '</select></div><div><label for="d-size">' + t(X.size) + '</label><select id="d-size">' + opts(X.sizeOpts) + '</select></div></div><div><label for="d-msg">' + t(X.msg) + '</label><textarea id="d-msg" rows="3"></textarea></div><button class="btn primary" type="submit">' + t(X.send) + '</button><p class="small">' + t(X.note).replace(S.lang === "en" ? "privacy policy" : "privacyverklaring", '<a class="link" href="#privacy">$&</a>') + '</p><div id="d-sent" aria-live="polite"></div></form></div><p class="small" style="margin-top:18px"><a class="link" href="#klanten">' + t(X.client) + "</a></p></div>";
  }

  function support() {
    var X = P.support;
    function qa(list) { return list.map(function (q) { return "<article><h3>" + t(q[0]) + "</h3><p>" + t(q[1]) + "</p></article>"; }).join(""); }
    return head(X.eye, X.h1, X.lead) + '<div class="contact"><h2>' + t(X.bizH) + "</h2><p><b>" + t(P.biz.name) + "</b></p><dl>" + P.biz.lines.map(function (l) { return "<div><dt>" + t(l[0]) + "</dt><dd>" + marks(l[1]) + "</dd></div>"; }).join("") + '</dl></div><h2 class="faqh">' + t(X.clients) + '</h2><div class="faq">' + qa(X.qClients) + '</div><h2 class="faqh">' + t(X.owners) + '</h2><div class="faq">' + qa(X.qOwners) + "</div></div>" + cta();
  }

  function deletion() {
    var X = P.del;
    function list(c, items) { return '<ul class="' + c + '">' + items.map(function (i) { return "<li><span>" + t(i) + "</span></li>"; }).join("") + "</ul>"; }
    return head(X.eye, X.h1, X.lead) + '<div class="delgrid"><div class="dcard"><h3>' + t(X.appH) + '</h3><ol class="olist bare" style="list-style:none;padding:0;margin-top:8px">' + X.app.map(function (s) { return "<li><div><span>" + t(s) + "</span></div></li>"; }).join("") + '</ol></div><div class="dcard"><h3>' + t(X.goneH) + "</h3>" + list("ticks", X.gone) + '</div><div class="dcard"><h3>' + t(X.keepH) + "</h3>" + list("dots", X.keep) + '</div></div><p class="notebox">' + t(X.owner) + "</p></div>";
  }

  function legal(key, title) {
    return '<div class="wrap hero ahero"><h1>' + t(title) + '</h1>' + statusLine() + '<p class="notebox" style="margin-top:20px">' + t(P.legal.draft) + '</p><div class="legal">' + t(window.LEGAL[key]) + "</div></div>";
  }

  function subs() {
    var X = P.legal;
    return '<div class="wrap hero ahero"><h1>' + t(X.subH) + '</h1><p class="lead">' + t(X.subLead) + "</p>" + statusLine() + '<div class="tablewrap"><table><thead><tr>' + X.subCols.map(function (c) { return "<th>" + t(c) + "</th>"; }).join("") + "</tr></thead><tbody>" + X.subs.map(function (r) { return "<tr><td><b>" + r[0] + "</b></td><td>" + t(r[1]) + "</td><td>" + t(r[2]) + "</td></tr>"; }).join("") + '</tbody></table></div><p class="notebox">' + t(X.subNote) + '</p><p class="notebox">' + t(X.draft) + "</p></div>";
  }

  /* what the decisions, required pages and search work look like, on the design-choices page */
  function directionMore() {
    var X = P.direction;
    function rows(list) { return '<ol class="olist" style="list-style:none;padding:0">' + list.map(function (o) { return "<li><div><b>" + t(o[0]) + "</b><span>" + t(o[1]) + "</span></div></li>"; }).join("") + "</ol>"; }
    return '<section><div class="wrap"><h2 class="h2">' + t(X.youH) + "</h2>" + rows(X.you) + '</div></section><section><div class="wrap"><h2 class="h2">' + t(X.decidedH) + "</h2>" + rows(X.decided) + '</div></section><section><div class="wrap"><h2 class="h2">' + t(X.needsH) + '</h2><p class="lead" style="margin-top:12px">' + t(X.needsLead) + '</p><div class="tablewrap"><table><thead><tr>' + X.needsCols.map(function (c) { return "<th>" + t(c) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      X.needs.map(function (n) { return "<tr><td><b>" + n[0] + "</b></td><td>" + t(n[1]) + '</td><td><a class="link" href="#' + n[3] + '">' + t(n[2]) + "</a>" + (n[4] ? " <mark>" + (S.lang === "en" ? "your details" : "jouw gegevens") + "</mark>" : "") + "</td></tr>"; }).join("") +
      '</tbody></table></div></div></section><section><div class="wrap"><h2 class="h2">' + t(X.seoH) + '</h2><p class="lead" style="margin-top:12px">' + t(X.seoLead) + '</p><div class="serp">' +
      X.seo.map(function (s) { return '<article><cite>fivvi.app' + (S.lang === "en" ? s[1] : s[0]).replace(/^\/$/, "") + "</cite><h3>" + t(s[2]) + "</h3><p>" + t(s[3]) + "</p></article>"; }).join("") + '</div><h3 class="subh">' + t(X.seoMoreH) + '</h3><div class="dgrid four">' +
      X.seoMore.map(function (c) { return '<div class="dcard"><h3>' + t(c[0]) + "</h3><p>" + t(c[1]) + "</p></div>"; }).join("") + "</div></div></section>";
  }

  function render(keepScroll) {
    var y = window.scrollY, r = route();
    root.lang = S.lang === "en" ? "en" : "nl";
    renderNav();
    var F = P.foot;
    page.innerHTML = r === "home" ? home() : r === "richting" ? direction() : r === "prijzen" ? pricing() : r === "demo" ? demo() : r === "support" ? support() : r === "account-verwijderen" ? deletion() : r === "privacy" ? legal("privacy", F.privacy) : r === "voorwaarden" ? legal("terms", F.terms) : r === "subverwerkers" ? subs() : audience(r);
    document.title = "Fivvi Website";
    window.scrollTo({ top: keepScroll ? y : 0, behavior: "instant" });
  }

  function refreshImages() {
    document.querySelectorAll("img[data-shot]").forEach(function (i) { i.src = shotSrc(i.dataset.shot); });
    renderNav();
  }

  document.addEventListener("click", function (e) {
    var b = e.target.closest("[data-lang],[data-who],[data-kind],[data-plat],[data-demo],[data-theme-toggle]");
    if (!b) return;
    if (b.dataset.lang) { S.lang = b.dataset.lang; try { localStorage.setItem("fivvi-site-lang", S.lang); } catch (x) { /* storage unavailable */ } render(true); return; }
    if (b.dataset.who) {
      S.who = b.dataset.who;
      document.querySelectorAll("[data-who]").forEach(function (o) { o.setAttribute("aria-pressed", o.dataset.who === S.who); });
      document.getElementById("stage").innerHTML = stage();
      document.getElementById("heroart").innerHTML = art(S.who);
      document.getElementById("herocopy").innerHTML = "<p>" + t(A[S.who].short) + '</p><a class="link" href="#' + S.who + '">' + t(UI.see) + " →</a>";
      return;
    }
    if (b.dataset.plat) {
      S.plat = b.dataset.plat;
      document.querySelectorAll("[data-plat]").forEach(function (o) { o.setAttribute("aria-pressed", o.dataset.plat === S.plat); });
      document.getElementById("devices").innerHTML = devices();
      return;
    }
    if (b.dataset.kind) { S.kind = b.dataset.kind; render(true); return; }
    if (b.dataset.demo != null) { S.demo = +b.dataset.demo; document.getElementById("chain").innerHTML = chain(); return; }
    if (b.dataset.themeToggle != null) { root.setAttribute("data-theme", mode() === "dark" ? "light" : "dark"); return; }
  });
  document.addEventListener("submit", function (e) {
    if (e.target.id !== "demo-form") return;
    e.preventDefault();
    document.getElementById("d-sent").innerHTML = '<p class="sent">' + t(P.demo.sent) + "</p>";
  });
  window.addEventListener("hashchange", function () { render(false); });
  new MutationObserver(refreshImages).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", refreshImages);
  render(false);
})();
