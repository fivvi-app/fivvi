/* Fivvi Pro: the same decisions as the web, as sheets. Parity with the trainer web where the spec has a mobile surface. */
(function () {
  "use strict";
  var F = window.FV, X = window.FVW.x, T = window.FVW.moreT, K = F.kit, esc = F.esc, SH = F.SHEETS, A = F.A;
  var ON = ["assign", "sub", "conflict", "cancel-scope", "cancel-priv", "cancel-late", "cancel-started", "move-late", "add-part", "rem-part", "req-review", "att-early", "class-plan", "trainer-noperm", "priv-trainer"];
  T.filter(function (t) { return ON.indexOf(t[0]) >= 0; }).forEach(function (t) {
    SH["st:" + t[0]] = function () {
      var b = t[5].map(function (x) { return '<p class="pro-line">' + esc(x[0]) + "</p>"; }).join("");
      if (t[6].length) b += '<div class="fgrp">' + t[6].map(function (x) { return K.fld(x[0], '<input type="text">'); }).join("") + "</div>";
      b += t.slice(10).map(function (x) { var cb = /^\[([ x])\] /.exec(x[0]); return '<label class="pro-check"><input type="' + (cb ? "checkbox" : "radio") + '" name="o"' + (cb && cb[1] === "x" ? " checked" : "") + "> <span>" + esc(x[0]) + "</span></label>"; }).join("");
      return { title: t[4][0], body: b, save: "pro-ok", saveLabel: t[7][0] };
    };
  });
  A["pro-ok"] = function () { F.S.sheet = null; F.render(); };
  /* notes on Vandaag and Agenda */
  var I = window.FIVVI_I18N, L = function (p) { I.add(p[0], p[1]); return p[0]; };
  ["today", "agenda"].forEach(function (k) { var o = F.SCREENS[k]; F.SCREENS[k] = function () { var r = o(); if (F.S.proNote) r.body = '<div class="pad" style="margin-bottom:12px"><div class="banner" style="--c:var(--gym)">' + F.ic("warn") + "<span>" + esc(F.S.proNote) + "</span></div></div>" + r.body; return r; }; });
  var PN = [["Vandaag: offline", "#457", ["Je bent offline. Laatst bijgewerkt om 09:12.", "You're offline. Last updated at 09:12."]], ["Vandaag: geen toegang meer", "#457", ["Je hebt geen toegang meer tot John's Gym.", "You no longer have access to John's Gym."]], ["Sessie: offline annuleren", "#462", ["Je bent offline. Annuleren kan als je weer verbinding hebt.", "You're offline. You can cancel once you're back online."]], ["Aanwezigheid: wacht op verbinding", "#460", ["Wacht op verbinding", "Waiting for connection"]], ["Training: synchroniseren (WL-07)", "M7", ["Je sets staan veilig op dit toestel. Ze gaan mee zodra je weer verbinding hebt.", "Your sets are safe on this device. They go along once you're back online."]]];
  var pro = F.INDEX.filter(function (g) { return g[0] === "Fivvi Pro app"; })[0][1];
  window.FVW.moreNotes.concat(PN).forEach(function (n) { L(n[2]); I.add(n[0], n[0]); pro.push([n[0], n[1], function () { F.fresh(); F.PREF.setup = "team"; F.PREF.role = "owner"; F.S.proNote = n[2][0]; }]); });
  T.filter(function (t) { return ON.indexOf(t[0]) >= 0; }).forEach(function (t) {
    pro.push([t[1], t[2], function () { F.fresh(); F.PREF.setup = "team"; F.PREF.role = "owner"; F.S.sheet = "st:" + t[0]; }]);
  });
})();
