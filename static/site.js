// The browser's half of a company's page: taking down an offer past its date on a page
// built before then, the request form's spam stamp, and one visit, counted once the page
// runs in a browser (a mail scanner fetching the link runs no script, so it is not a visit).
// Source text only ever goes in through textContent.
(function () {
  "use strict";
  var query = new URLSearchParams(location.search);

  // An offer past its end date never shows as current, even on an old page.
  var today = new Date().toLocaleDateString("en-CA");
  document.querySelectorAll("[data-ends]").forEach(function (n) {
    if (!n.dataset.ends || n.dataset.ends >= today) return;
    var section = n.closest("section");
    n.remove();
    if (section && !section.querySelector("[data-ends]")) {
      var none = document.createElement("p");
      none.textContent = "No current offers.";
      section.append(none);
    }
  });

  // ---- The request form: the page is static, so it asks for its spam stamp. No stamp means
  // requests can't be saved (no database yet), so the form gives way to a call. ----
  var leadForm = document.querySelector("[data-lead-form]");
  if (leadForm) {
    var noForm = function () {
      var p = document.createElement("p");
      p.className = leadForm.className;
      p.textContent = "Requests can't be sent from this page yet. Please call them instead.";
      leadForm.replaceWith(p);
    };
    fetch("/request/stamp")
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (j) { leadForm.querySelector('[name="_started"]').value = j.stamp; })
      .catch(noForm);
  }

  // ---- One visit: ?r= is the lead an email's link was made for; ?preview is the owner looking ----
  var page = document.querySelector("[data-company]");
  if (page && !query.has("preview") && navigator.sendBeacon) {
    var body = new URLSearchParams({ r: query.get("r") || "" });
    navigator.sendBeacon("/visit/" + encodeURIComponent(page.dataset.company), body);
  }
})();
