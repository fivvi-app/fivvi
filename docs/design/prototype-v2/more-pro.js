/* Fivvi Pro: the same decisions as the web, as sheets. Parity with the trainer web where the spec has a mobile surface. */
(function () {
  "use strict";
  var F = window.FV, X = window.FVW.x, T = window.FVW.moreT, K = F.kit, esc = F.esc, SH = F.SHEETS, A = F.A;
  var ON = ["conflict", "cancel-priv", "cancel-late", "cancel-started", "move-late", "add-part", "req-review", "att-early", "class-plan", "trainer-noperm"];
  T.filter(function (t) { return ON.indexOf(t[0]) >= 0; }).forEach(function (t) {
    SH["st:" + t[0]] = function () {
      var b = t[5].map(function (x) { return '<p class="pro-line">' + esc(x[0]) + "</p>"; }).join("");
      if (t[6].length) b += '<div class="fgrp">' + t[6].map(function (x) { return K.fld(x[0], '<input type="text">'); }).join("") + "</div>";
      var ask = (window.FVW.moreAsk || {})[t[0]]; if (ask) b += '<p class="pro-line"><b>' + esc(ask) + "</b></p>";
      b += t.slice(10).map(function (x) { var cb = /^\[([ x])\] /.exec(x[0]); return '<label class="pro-check"><input type="' + (cb ? "checkbox" : "radio") + '" name="o"' + ((cb && cb[1] === "x") || /^\*/.test(x[0]) ? " checked" : "") + "> <span>" + esc(x[0].replace(/^\[[ x]\] /, "").replace(/^\*/, "")) + "</span></label>"; }).join("");
      if (t[0] === "req-review") b = '<p class="pro-line">Telt als op tijd aangevraagd.</p><div class="fgrp">' + K.fld("Kort antwoord aan Anna", '<input type="text">') + "</div>" + K.btn("Verplaatsen", { blk: true, k: "sec", a: "pro-open", d: { v: "move-late" } }) + K.btn("Annuleren", { blk: true, k: "sec", a: "pro-open", d: { v: "cancel-priv" } }) + K.btn("Laten staan", { blk: true, a: "pro-ok", d: { m: t[9][0] } });
      if (t[0] !== "req-review") b += '<div style="margin-top:14px">' + K.btn(t[7][0], { blk: true, k: t[8] === "dng" ? "dng" : "pri", a: "pro-ok", d: { m: t[9] ? t[9][0] : "" } }) + "</div>";
      return { title: t[4][0], body: b };
    };
  });
  SH["me-email"] = function () { return { title: "E-mailadres wijzigen", body: '<div class="fgrp">' + K.fld("Nieuw e-mailadres", '<input type="email">') + '</div><p class="pro-line">We sturen een code naar je nieuwe adres. Met dat adres log je voortaan in, bij elke werkruimte.</p><div style="margin-top:14px">' + K.btn("Stuur code", { blk: true, a: "pro-ok", d: { m: "Code gestuurd" } }) + "</div>" }; };
  A["pro-me-email"] = function () { F.S.sheet = "me-email"; F.S.anim = "up"; F.render(); };
  A["pro-open"] = function (d) { F.S.sheet = "st:" + d.v; F.render(); };
  A["pro-ok"] = function (d) { if (["st:req-review", "st:move-late", "st:cancel-priv"].indexOf(F.S.sheet) >= 0 && /^Annulering aangevraagd/.test(F.S.proNote || "")) F.S.proNote = null; F.S.sheet = null; if (d && d.m) F.toast(d.m); else F.render(); };
  A["pro-note"] = function (d) { F.S.proNote = d.v || null; F.render(); };
  /* notes on Vandaag and Agenda */
  var I = window.FIVVI_I18N, L = function (p) { I.add(p[0], p[1]); return p[0]; };
  ["today", "agenda"].forEach(function (k) { var o = F.SCREENS[k]; F.SCREENS[k] = function () { var r = o(); if (F.S.proNote) { var req = /^Annulering aangevraagd/.test(F.S.proNote); r.body = '<div class="pad" style="margin-bottom:12px">' + (req ? '<button class="banner pro-tap" style="--c:var(--gym)" data-a="pro-open" data-v="req-review">' : '<div class="banner" style="--c:var(--gym)">') + F.ic("warn") + "<span>" + esc(F.S.proNote) + "</span>" + (req ? "</button>" : "</div>") + "</div>" + r.body; } r.body += protoOthers(); return r; }; });
  var PN = [["Vandaag: offline", "#457", ["Je bent offline. Laatst bijgewerkt om 09:12.", "You're offline. Last updated at 09:12."]], ["Vandaag: geen toegang meer", "#457", ["Je hebt geen toegang meer tot John's Gym.", "You no longer have access to John's Gym."]], ["Sessie: offline annuleren", "#462", ["Je bent offline. Annuleren kan als je weer verbinding hebt.", "You're offline. You can cancel once you're back online."]], ["Aanwezigheid: wacht op verbinding", "#460", ["Wacht op verbinding", "Waiting for connection"]], ["Vandaag: annulering aangevraagd", "#497", ["Annulering aangevraagd: Anna de Vries · di 10 nov, 10:30", "Cancellation requested: Anna de Vries · Tue 10 Nov, 10:30"]], ["Training: synchroniseren (WL-07)", "M7", ["Je sets staan veilig op dit toestel. Ze gaan mee zodra je weer verbinding hebt.", "Your sets are safe on this device. They go along once you're back online."]]];
  function protoOthers() {
    var fits = window.FVW.varFits, sheets = T.filter(function (t) { return ON.indexOf(t[0]) >= 0 && fits(t[0], t[1]); }), notes = window.FVW.moreNotes.concat(PN).filter(function (x) { return fits("", x[0]); }), n = sheets.length + notes.length;
    return '<div class="pad" style="margin-top:14px"><details class="card c-proto"><summary><b>Prototype</b> · <span>Andere situaties</span> (' + n + ')</summary><div class="c-chips">' +
      sheets.map(function (t) { return '<button class="c-chip" data-a="pro-open" data-v="' + esc(t[0]) + '">' + esc(t[1]) + "</button>"; }).join("") +
      (F.S.proNote ? '<button class="c-chip" data-a="pro-note" data-v="">Geen melding</button>' : "") + notes.map(function (x) { return '<button class="c-chip" data-a="pro-note" data-v="' + esc(x[2][0]) + '">' + esc(x[0]) + "</button>"; }).join("") + "</div></details></div>";
  }
  [["Vandaag: offline", "Today: offline"], ["Vandaag: geen toegang meer", "Today: no access any more"], ["Sessie: offline annuleren", "Session: cancelling offline"], ["Aanwezigheid: wacht op verbinding", "Attendance: waiting for connection"], ["Vandaag: annulering aangevraagd", "Today: cancellation requested"], ["Training: synchroniseren (WL-07)", "Workout: syncing (WL-07)"]].forEach(L);
  L(["Geen melding", "No notice"]); L(["Stuur code", "Send code"]); L(["Code gestuurd", "Code sent"]);
  var pro = F.INDEX.filter(function (g) { return g[0] === "Fivvi Pro app"; })[0][1];
  pro.push(["Profiel: e-mailadres wijzigen", "F005", function () { F.fresh(); F.PREF.setup = "team"; F.S.tab = "profile"; F.S.sheet = "me-email"; }]);
  window.FVW.moreNotes.concat(PN).forEach(function (n) { L(n[2]); pro.push([n[0], n[1], function () { F.fresh(); F.PREF.setup = "team"; F.PREF.role = "owner"; F.S.proNote = n[2][0]; }]); });
  T.filter(function (t) { return ON.indexOf(t[0]) >= 0; }).forEach(function (t) {
    pro.push([t[1], t[2], function () { F.fresh(); F.PREF.setup = "team"; F.PREF.role = "owner"; F.S.sheet = "st:" + t[0]; }]);
  });
})();
