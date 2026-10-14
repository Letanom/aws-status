"use strict";
(() => {
  const API = "/api/status";
  const LS = "aws-status:";
  const LEVELS = ["ok", "info", "degraded", "disruption"];
  const RANK = { ok: 0, info: 1, degraded: 2, disruption: 3, unknown: -1 };
  const GLYPH = { ok: "✓", info: "i", degraded: "!", disruption: "×", unknown: "?" };
  const FAVICON = { ok: "#1E9E76", info: "#7C5CC4", degraded: "#E8A800", disruption: "#D6403B", unknown: "#8696A4" };
  const EMOJI = { ok: "🟢", info: "🔵", degraded: "🟠", disruption: "🔴", unknown: "⚪" };
  const KEY_ROWS = ["ec2", "eks", "lambda", "rds", "dynamodb", "s3", "cloudfront", "route53", "elb", "iam"];
  const STALE_MS = 15 * 60_000;
  const SVG_NS = "http://www.w3.org/2000/svg";

  /* ------------------------------------------------------------------ metinler */
  const I18N = {
    tr: {
      skip: "İçeriğe geç", brand: "AWS Durum Paneli",
      nav_board: "Tablo", nav_probes: "Erişim testleri", nav_history: "Geçmiş", nav_about: "Veri ve güvenilirlik",
      theme_auto: "Tema: otomatik", theme_light: "Tema: açık", theme_dark: "Tema: koyu",
      notify_off: "Bildirim", notify_on: "Bildirim açık", notify_denied: "Bildirim engelli", notify_unsupported: "Bildirim yok",
      refresh: "Yenile", refreshing: "Yenileniyor…",
      level_ok: "Sorun yok", level_info: "Dikkat", level_degraded: "Performans sorunu", level_disruption: "Kesinti", level_unknown: "Doğrulanamıyor",
      verdict_ok: "AWS şu an sorunsuz görünüyor.", verdict_info: "Küçük bir uyarı var.", verdict_degraded: "Bazı AWS servislerinde sorun var.",
      verdict_disruption: "AWS'de kesinti yaşanıyor.", verdict_unknown: "Durum şu an doğrulanamıyor.",
      verdict_mine_ok: "İzleme listenizde sorun yok.", verdict_mine_info: "İzleme listenizde küçük bir uyarı var.",
      verdict_mine_degraded: "İzleme listenizde performans sorunu var.", verdict_mine_disruption: "İzleme listenizde kesinti var.",
      sub_none: "Açık olay yok.", sub_n: "{n} açık olay var.", sub_checked: "Son kontrol {ago}.",
      sub_elsewhere: "AWS'nin izlemediğiniz bölümlerinde durum: {level}.",
      just_now: "az önce",
      stale_warn: "Veri {ago} güncellendi. Arka plan kontrolü gecikmiş olabilir, bu yüzden gördüğünüz durum güncel olmayabilir.",
      offline_warn: "Sunucuya ulaşılamıyor. Son alınan veri gösteriliyor.",
      loading_title: "Veriler yükleniyor…", nodata_title: "Henüz veri yok.",
      nodata_sub: "İlk kontrol turu tamamlanınca burada görünür. Birkaç dakika sürebilir, sayfa kendiliğinden yenilenir.",
      chip_aws_ok: "AWS durum akışı çalışıyor ({ms} ms)", chip_aws_err: "AWS durum akışı okunamadı",
      chip_probe: "{ok}/{total} erişim testi başarılı", chip_probe_none: "Erişim testleri kapalı",
      chip_dd_ok: "DownDetector sorun bildirmiyor", chip_dd_possible: "DownDetector olası sorun gösteriyor",
      chip_dd_problem: "DownDetector'da sorun raporları var", chip_dd_unknown: "DownDetector okunamadı", chip_dd_off: "DownDetector kapalı",
      reason_incident: "{svc}, {region}: {title}",
      reason_probe: "{region} bölgesinde erişim testleri art arda iki kontrolde başarısız oldu ({n}).",
      reason_dd_un: "DownDetector'da kullanıcılar sorun bildiriyor, ancak AWS henüz doğrulamadı.",
      reason_dd_ok: "DownDetector'daki kullanıcı raporları AWS'nin bildirimini destekliyor.",
      reason_feed: "AWS durum akışı okunamadı, resmi bildirimler kontrol edilemiyor.",
      reason_more: "Ve {n} neden daha.",
      f_title: "İzleme listem", f_regions: "Bölgeler", f_services: "Servisler", f_all: "hepsi", f_n: "{n} seçili",
      f_only: "Sadece izlediklerimi göster", f_clear: "Temizle",
      board_title: "Bölge ve servis tablosu", board_hint: "Bir hücreye tıklayarak o servis ve bölgedeki olayları süzün.",
      rows_more: "Tüm servisleri göster ({n})", rows_less: "Yalnızca önemli servisleri göster",
      multi_row: "Birden fazla servis", global: "Global",
      sel_label: "Süzülen: {what}", sel_clear: "Süzmeyi kaldır",
      legend_ok: "Sorun bildirilmedi", legend_info: "Dikkat", legend_degraded: "Performans sorunu", legend_disruption: "Kesinti",
      tip_ok: "AWS bu serviste olay bildirmedi.", tip_probe: "Erişim testi: {ms} ms", tip_probe_fail: "Erişim testi başarısız", tip_probe_slow: "Erişim testi yavaş: {ms} ms",
      active_title: "Açık olaylar", active_empty: "Şu anda açık olay yok.",
      active_empty_sub: "Son 30 günde {n} olay kayıtlı.", active_empty_sub0: "Son 30 günde kayıtlı olay yok.",
      no_match: "Bu süzmeyle eşleşen açık olay yok.",
      started: "{ago} başladı", last_upd: "son güncelleme {ago}", upd_n: "Güncellemeler ({n})",
      trend_title: "Son 24 saat", trend_desc: "Başarılı erişim testlerinin medyan gecikmesi. Renkli bantlar sorunlu dönemleri gösterir.",
      trend_empty: "Grafik için henüz yeterli veri yok. Kontroller 5 dakikada bir eklenir.",
      probes_title: "Canlı erişim testleri", probes_desc: "Her kontrol turunda AWS uç noktalarına gerçek bir istek atılır.",
      probes_note: "Ölçümler sunucu tarafından yapılır, sizin ağınızdaki gecikmeyi yansıtmaz.",
      p_region: "Bölge", p_trend: "Son 3 saat", p_fail: "yanıt yok", p_slow: "yavaş", p_none: "Erişim testi ayarlanmamış.",
      uptime_title: "Son 90 gün", uptime_sum: "İzlenen sürenin %{pct} kadarında sorun yoktu.", uptime_sum_none: "Henüz yeterli veri yok.",
      uptime_since: "İzleme {date} tarihinde başladı. Öncesi gri gösterilir.",
      day_tip: "{date}: {n} kontrol, {bad} sorunlu", day_none: "{date}: veri yok",
      hist_title: "Olay geçmişi", search_ph: "Olay, servis veya bölge ara",
      st_all: "Tüm durumlar", st_active: "Açık", st_resolved: "Çözüldü", st_stale: "Güncelleme yok", sev_all: "Tüm şiddetler",
      more: "Daha fazla göster ({n})", hist_empty: "Eşleşen olay yok.", dur: "Süre: {d}", ongoing: "devam ediyor",
      stale_note: "Kapatılmadı, {h} saattir güncelleme yok", peak: "en kötü: {level}",
      about_title: "Veri nereden geliyor, ne kadar güvenilir?",
      about_lead: "Bu panel tek bir kaynağa güvenmez. Üç bağımsız sinyali karşılaştırır ve hangisine ne kadar güvenilebileceğini aşağıda açıkça gösterir.",
      fact_interval: "Arka plan kontrolü", fact_interval_v: "{n} dk", fact_ui: "Bu sayfanın yenilenmesi", fact_ui_v: "{n} sn",
      fact_age: "Verinin yaşı", fact_since: "İzleme başlangıcı",
      dt_what: "Ne ölçer", dt_how: "Nasıl çekilir", dt_when: "Ne sıklıkla", dt_limit: "Sınırı", dt_now: "Şu anki durum", trust: "Güven",
      trust_1: "Düşük", trust_2: "Orta", trust_3: "Orta-yüksek", trust_4: "Yüksek",
      src1_name: "AWS resmi durum akışı", src1_sub: "AWS'nin kendi olay bildirimleri",
      src1_what: "AWS'nin kendisinin yayımladığı kesinti ve performans bildirimleri.",
      src1_how: "Sunucu <code>{url}</code> adresini okur. Her kayıttan servis, bölge ve zaman çıkarılır, aynı servis ve bölgedeki güncellemeler tek olayda birleştirilir. “Resolved” veya “operating normally” içeren güncelleme olayı kapatır.",
      src1_when: "Her {n} dakikada bir.",
      src1_limit: "AWS bir olayı bazen dakikalar, bazen saatler sonra bildirir, bu yüzden tek başına “sorun yok” demek için yeterli değildir. Hesabınıza özel olaylar için AWS Health API gerekir.",
      src1_now: "{ms} ms, {items} kayıt okundu, son okuma {ago}.", src1_now_err: "Okunamadı: {err}",
      src2_name: "Canlı erişim testleri", src2_sub: "Gerçek istekle ölçülen erişilebilirlik",
      src2_what: "AWS uç noktalarının ayakta olup olmadığı ve ne kadar hızlı yanıt verdiği.",
      src2_how: "{regions} bölgedeki {services} servisine ({total} uç nokta) herkese açık adreslerden bir GET isteği atılır. 5xx yanıt ya da {timeout} sn içinde yanıt gelmemesi hata sayılır, hata olursa bir kez daha denenir. Art arda iki turda hata alınırsa sorun sayılır.",
      src2_when: "Her {n} dakikada bir.",
      src2_limit: "Ölçüm tek bir noktadan (Netlify sunucusu) yapılır ve uç noktayı ölçer, bölgenin tamamını değil. Bütün erişim testleri aynı anda başarısız olursa suçlu büyük ihtimalle bizim ağımızdır, bu yüzden en fazla “Dikkat” verilir.",
      src2_now: "{ok}/{total} erişim testi başarılı, medyan gecikme {ms} ms.", src2_now_none: "Erişim testi ayarlanmamış.",
      src3_name: "DownDetector", src3_sub: "Kullanıcıların bildirdiği sorunlar",
      src3_what: "Kullanıcıların AWS ile ilgili sorun bildirimlerindeki ani artış.",
      src3_how: "Sunucu <code>{url}</code> sayfasının metnini okur ve “sorun yok”, “olası sorun” ya da “sorun var” olarak yorumlar.",
      src3_when: "Her {n} dakikada bir.",
      src3_limit: "Topluluk raporlarıdır, yanlış alarm verebilir. Tek başına en fazla “Dikkat” seviyesi üretir. Sayfa bot koruması yüzünden okunamazsa yok sayılır, durumu kötüleştirmez.",
      src3_now_ok: "Kullanıcılar sorun bildirmiyor.", src3_now_possible: "Olası sorun görünüyor.", src3_now_problem: "Sorun raporları var.",
      src3_now_unknown: "Sayfa okunamadı, yok sayılıyor.", src3_now_off: "Kapalı.",
      levels_title: "Karar nasıl veriliyor?",
      lv_ok: "AWS aktif olay bildirmedi, erişim testleri başarılı.",
      lv_info: "Bilgilendirme mesajı var, ya da yalnızca DownDetector sorun gösteriyor, ya da bütün erişim testleri aynı anda başarısız oldu.",
      lv_degraded: "AWS performans düşüşü bildirdi, ya da bir uç nokta art arda iki turda yanıt vermedi.",
      lv_disruption: "AWS kesinti bildirdi.",
      lv_unknown: "AWS akışı okunamıyor ve başka sinyal yok. Yeşil gösterilmez.",
      limits_title: "Bilmeniz gerekenler",
      lim1: "<strong>Bağımsız bir sayfadır.</strong> AWS'nin resmi panosu değildir. Resmi kaynak status.aws.amazon.com adresidir.",
      lim2: "<strong>Açık olay süresi {h} saattir.</strong> Bu süreden eski ve kapatılmamış olaylar “güncelleme yok” olarak ayrı gösterilir, genel durumu etkilemez.",
      lim3: "<strong>Geçmiş izleme başladığında başlar.</strong> Daha eski olaylar yalnızca AWS akışında hâlâ duruyorsa görünür.",
      lim4: "<strong>Veri eskirse sayfa sizi uyarır.</strong> Arka plan kontrolü 15 dakikadan uzun süre çalışmazsa üstte uyarı çıkar. Dış izleme için <code>/api/health</code> adresi kullanılabilir.",
      lim5: "<strong>Olay ayrıntıları İngilizcedir.</strong> AWS güncellemelerini yalnızca İngilizce yayımlar. Başlıkları Türkçeye çeviriyoruz, güncelleme metinleri AWS’nin yazdığı gibi kalır.",
      foot_text: "Veri: AWS durum akışı, canlı erişim testleri ve DownDetector. Bağımsız bir projedir, AWS ile bağlantısı yoktur.",
      foot_json: "JSON verisi", foot_health: "Sağlık kontrolü", foot_src: "Kaynak kodu",
      notif_title: "AWS durumu değişti",
    },
    en: {
      skip: "Skip to content", brand: "AWS Status Panel",
      nav_board: "Board", nav_probes: "Probes", nav_history: "History", nav_about: "Data and reliability",
      theme_auto: "Theme: auto", theme_light: "Theme: light", theme_dark: "Theme: dark",
      notify_off: "Notify me", notify_on: "Notifications on", notify_denied: "Notifications blocked", notify_unsupported: "No notifications",
      refresh: "Refresh", refreshing: "Refreshing…",
      level_ok: "All clear", level_info: "Heads-up", level_degraded: "Degraded", level_disruption: "Outage", level_unknown: "Can't verify",
      verdict_ok: "AWS looks healthy right now.", verdict_info: "There's a minor notice.", verdict_degraded: "Some AWS services have problems.",
      verdict_disruption: "AWS has an outage.", verdict_unknown: "Status can't be verified right now.",
      verdict_mine_ok: "Your watchlist is healthy.", verdict_mine_info: "Your watchlist has a minor notice.",
      verdict_mine_degraded: "Your watchlist has degraded services.", verdict_mine_disruption: "Your watchlist has an outage.",
      sub_none: "No open incidents.", sub_n: "{n} open incidents.", sub_checked: "Last check {ago}.",
      sub_elsewhere: "Outside your watchlist, AWS status is: {level}.",
      just_now: "just now",
      stale_warn: "Data was last updated {ago}. The background check may be delayed, so what you see might be out of date.",
      offline_warn: "Can't reach the server. Showing the last data received.",
      loading_title: "Loading data…", nodata_title: "No data yet.",
      nodata_sub: "It will appear when the first check finishes. This can take a few minutes, and the page refreshes by itself.",
      chip_aws_ok: "AWS status feed is up ({ms} ms)", chip_aws_err: "AWS status feed unreadable",
      chip_probe: "{ok}/{total} probes responded", chip_probe_none: "Probes disabled",
      chip_dd_ok: "DownDetector reports no problems", chip_dd_possible: "DownDetector shows possible problems",
      chip_dd_problem: "DownDetector has problem reports", chip_dd_unknown: "DownDetector unreadable", chip_dd_off: "DownDetector disabled",
      reason_incident: "{svc}, {region}: {title}",
      reason_probe: "Probes in {region} failed two checks in a row ({n}).",
      reason_dd_un: "Users report problems on DownDetector, but AWS hasn't confirmed yet.",
      reason_dd_ok: "User reports on DownDetector support AWS's notice.",
      reason_feed: "The AWS status feed couldn't be read, so official notices can't be checked.",
      reason_more: "And {n} more.",
      f_title: "My watchlist", f_regions: "Regions", f_services: "Services", f_all: "all", f_n: "{n} selected",
      f_only: "Show only my watchlist", f_clear: "Clear",
      board_title: "Region and service board", board_hint: "Click a cell to filter incidents for that service and region.",
      rows_more: "Show all services ({n})", rows_less: "Show key services only",
      multi_row: "Multiple services", global: "Global",
      sel_label: "Filtering: {what}", sel_clear: "Clear filter",
      legend_ok: "No reports", legend_info: "Heads-up", legend_degraded: "Degraded", legend_disruption: "Outage",
      tip_ok: "AWS has not reported an incident for this service.", tip_probe: "Probe: {ms} ms", tip_probe_fail: "Probe did not respond", tip_probe_slow: "Probe is slow: {ms} ms",
      active_title: "Open incidents", active_empty: "No open incidents right now.",
      active_empty_sub: "{n} incidents recorded in the last 30 days.", active_empty_sub0: "No incidents recorded in the last 30 days.",
      no_match: "No open incidents match this filter.",
      started: "started {ago}", last_upd: "last update {ago}", upd_n: "Updates ({n})",
      trend_title: "Last 24 hours", trend_desc: "Median latency of healthy probes. Colored bands mark problem periods.",
      trend_empty: "Not enough data for a chart yet. A check is added every 5 minutes.",
      probes_title: "Live probes", probes_desc: "Every check sends a real request to AWS endpoints.",
      probes_note: "Measured from the server, so it doesn't reflect latency on your own network.",
      p_region: "Region", p_trend: "Last 3 hours", p_fail: "no response", p_slow: "slow", p_none: "No probes configured.",
      uptime_title: "Last 90 days", uptime_sum: "{pct}% of the monitored time had no problems.", uptime_sum_none: "Not enough data yet.",
      uptime_since: "Monitoring started on {date}. Earlier days are gray.",
      day_tip: "{date}: {n} checks, {bad} with problems", day_none: "{date}: no data",
      hist_title: "Incident history", search_ph: "Search incident, service or region",
      st_all: "All statuses", st_active: "Open", st_resolved: "Resolved", st_stale: "No updates", sev_all: "All severities",
      more: "Show more ({n})", hist_empty: "No matching incidents.", dur: "Duration: {d}", ongoing: "ongoing",
      stale_note: "Not closed, no updates for {h} hours", peak: "worst: {level}",
      about_title: "Where does the data come from, and how reliable is it?",
      about_lead: "This panel doesn't trust a single source. It compares three independent signals and shows below how far each one can be trusted.",
      fact_interval: "Background check", fact_interval_v: "{n} min", fact_ui: "This page refreshes", fact_ui_v: "{n} s",
      fact_age: "Data age", fact_since: "Monitoring since",
      dt_what: "What it measures", dt_how: "How it's fetched", dt_when: "How often", dt_limit: "Limitation", dt_now: "Right now", trust: "Trust",
      trust_1: "Low", trust_2: "Medium", trust_3: "Medium-high", trust_4: "High",
      src1_name: "Official AWS status feed", src1_sub: "AWS's own incident notices",
      src1_what: "Outage and performance notices published by AWS itself.",
      src1_how: "The server reads <code>{url}</code>. Service, region and time are extracted from each entry, and updates for the same service and region are merged into one incident. An update saying “resolved” or “operating normally” closes it.",
      src1_when: "Every {n} minutes.",
      src1_limit: "AWS sometimes reports an incident minutes or hours late, so this alone can't prove that everything is fine. Account-specific events need the AWS Health API.",
      src1_now: "{ms} ms, {items} entries read, last read {ago}.", src1_now_err: "Could not read: {err}",
      src2_name: "Live probes", src2_sub: "Availability measured with real requests",
      src2_what: "Whether AWS endpoints are up and how fast they respond.",
      src2_how: "One GET request goes to public addresses of {services} in {regions} regions ({total} endpoints). A 5xx response or no answer within {timeout} s counts as a failure and is retried once. Two failed rounds in a row count as a problem.",
      src2_when: "Every {n} minutes.",
      src2_limit: "Measured from a single point (a Netlify server), and it measures the endpoint, not the whole region. If every probe fails at once, our own network is the likely culprit, so the result is capped at “Heads-up”.",
      src2_now: "{ok}/{total} probes responded, median latency {ms} ms.", src2_now_none: "No probes configured.",
      src3_name: "DownDetector", src3_sub: "Problems reported by users",
      src3_what: "A sudden rise in user reports of AWS problems.",
      src3_how: "The server reads the text of <code>{url}</code> and interprets it as “no problems”, “possible problems” or “problems”.",
      src3_when: "Every {n} minutes.",
      src3_limit: "These are community reports and can be false alarms. Alone, they produce “Heads-up” at most. If the page can't be read because of bot protection, it is ignored and never worsens the status.",
      src3_now_ok: "Users report no problems.", src3_now_possible: "Possible problems showing.", src3_now_problem: "Problem reports present.",
      src3_now_unknown: "Page unreadable, ignored.", src3_now_off: "Disabled.",
      levels_title: "How is the verdict decided?",
      lv_ok: "AWS reports no active incident and probes are healthy.",
      lv_info: "There is an informational notice, only DownDetector shows problems, or every probe failed at once.",
      lv_degraded: "AWS reported degraded performance, or an endpoint failed two rounds in a row.",
      lv_disruption: "AWS reported an outage.",
      lv_unknown: "The AWS feed can't be read and there's no other signal. It is never shown as green.",
      limits_title: "Good to know",
      lim1: "<strong>This is an independent page.</strong> It is not AWS's official dashboard. The official source is status.aws.amazon.com.",
      lim2: "<strong>An incident counts as open for {h} hours.</strong> Older, unclosed incidents are shown separately as “no updates” and don't affect the overall status.",
      lim3: "<strong>History starts when monitoring starts.</strong> Earlier incidents appear only if they are still in the AWS feed.",
      lim4: "<strong>The page warns you when data goes stale.</strong> If the background check stops for over 15 minutes, a warning appears at the top. Use <code>/api/health</code> for external monitoring.",
      foot_text: "Data: AWS status feed, live probes and DownDetector. An independent project, not affiliated with AWS.",
      foot_json: "JSON data", foot_health: "Health check", foot_src: "Source code",
      notif_title: "AWS status changed",
    },
  };

  /* ------------------------------------------------------------------ durum */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(LS + k); return v == null ? d : v; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(LS + k, v); } catch { /* yok say */ } },
  };
  const state = {
    data: null, nodata: false, offline: false, lastFetch: 0,
    lang: "tr", theme: "auto",
    watchR: new Set(), watchS: new Set(), mine: false, notify: false, allRows: false,
    sel: null, q: "", fStatus: "all", fSev: "all", shown: 20, introDone: false, pickersBuilt: "",
  };

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const t = (k, p) => {
    let s = (I18N[state.lang] && I18N[state.lang][k]) ?? I18N.tr[k] ?? k;
    if (p) s = s.replace(/\{(\w+)\}/g, (_, n) => (p[n] != null ? String(p[n]) : ""));
    return s;
  };
  const loc = () => (state.lang === "tr" ? "tr-TR" : "en-GB");

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : String(v));
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(typeof kid === "object" && kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  function sv(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, String(v));
    for (const kid of kids.flat()) if (kid != null) el.append(typeof kid === "object" ? kid : document.createTextNode(String(kid)));
    return el;
  }
  /** <code> ve <strong> etiketlerini güvenle DOM'a çevirir; başka HTML işlenmez. */
  function rich(str) {
    const frag = document.createDocumentFragment();
    const re = /<(code|strong)>(.*?)<\/\1>/g;
    let last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) frag.append(str.slice(last, m.index));
      frag.append(h(m[1], null, m[2]));
      last = re.lastIndex;
    }
    if (last < str.length) frag.append(str.slice(last));
    return frag;
  }

  const cat = () => state.data?.catalog ?? { regions: {}, services: {}, coreRegions: [], coreServices: [] };
  const sLabel = (k) => (k === "multi" || k === "multipleservices" ? t("multi_row") : cat().services[k] || k);
  const rName = (c) => (c === "global" ? t("global") : cat().regions[c] || "");
  const rLabel = (c) => (c === "global" ? t("global") : cat().regions[c] ? `${cat().regions[c]} (${c})` : c);

  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 45) return t("just_now");
    const rtf = new Intl.RelativeTimeFormat(loc(), { numeric: "always" });
    if (s < 3600) return rtf.format(-Math.max(1, Math.round(s / 60)), "minute");
    if (s < 86400) return rtf.format(-Math.round(s / 3600), "hour");
    return rtf.format(-Math.round(s / 86400), "day");
  }
  function dur(ms) {
    const tr = state.lang === "tr";
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return tr ? `${m} dk` : `${m}m`;
    const hrs = Math.floor(m / 60);
    if (hrs < 48) return tr ? `${hrs} sa ${m % 60} dk` : `${hrs}h ${m % 60}m`;
    const d = Math.floor(hrs / 24);
    return tr ? `${d} gün ${hrs % 24} sa` : `${d}d ${hrs % 24}h`;
  }
  const fmtDT = (ts) => new Intl.DateTimeFormat(loc(), { dateStyle: "medium", timeStyle: "short" }).format(ts);
  const fmtTime = (ts) => new Intl.DateTimeFormat(loc(), { hour: "2-digit", minute: "2-digit" }).format(ts);
  const fmtDate = (ts) => new Intl.DateTimeFormat(loc(), { dateStyle: "medium", timeZone: "UTC" }).format(ts);


  /* ------------------------------------------------------------------ AWS başlıklarını Türkçeye çevirme */
  // AWS başlıkları kalıplıdır. Bilinen kalıplar çevrilir, bilinmeyen kısımlar olduğu gibi kalır.
  const TITLE_PREFIX_TR = [
    [/^Service disruption:\s*/i, "Servis kesintisi: "],
    [/^Service degradation:\s*/i, "Performans sorunu: "],
    [/^Service impact:\s*/i, "Servis etkisi: "],
    [/^Informational message:\s*/i, "Bilgilendirme: "],
    [/^Service is operating normally:\s*/i, "Servis normale döndü: "],
    [/\[RESOLVED\]\s*/i, "[Çözüldü] "],
  ];
  const TITLE_PHRASE_TR = [
    [/Increased API Error Rates/i, "Artan API hata oranları"],
    [/Increased Connectivity Issues/i, "Artan bağlantı sorunları"],
    [/Increased Provisioning Times/i, "Artan hazırlama süreleri"],
    [/Increased Error Rates/i, "Artan hata oranları"],
    [/Elevated Error Rates/i, "Yükselen hata oranları"],
    [/Increased Latenc(?:y|ies)/i, "Artan gecikmeler"],
    [/Elevated Latenc(?:y|ies)/i, "Yükselen gecikmeler"],
    [/Delayed (?:Cluster|Instance) Creation/i, "Gecikmeli oluşturma"],
    [/Connectivity Issues/i, "Bağlantı sorunları"],
    [/API Error Rates/i, "API hata oranları"],
    [/Increased Errors/i, "Artan hatalar"],
  ];
  function trTitle(title) {
    if (state.lang !== "tr" || !title) return title;
    let out = title, hit = false;
    for (const [re, to] of TITLE_PREFIX_TR) if (re.test(out)) { out = out.replace(re, to); hit = true; }
    for (const [re, to] of TITLE_PHRASE_TR) if (re.test(out)) { out = out.replace(re, to); hit = true; }
    if (hit) out = out.replace(/\s+and\s+/gi, " ve ").replace(/\s+/g, " ").trim();
    return out;
  }

  /* ------------------------------------------------------------------ kapsam (izleme listesi) */
  const scopeOn = () => state.mine && (state.watchR.size > 0 || state.watchS.size > 0);
  const inR = (r) => !scopeOn() || state.watchR.size === 0 || r === "global" || state.watchR.has(r);
  const inS = (s) => !scopeOn() || state.watchS.size === 0 || s === "multi" || state.watchS.has(s);
  const incSvcs = (i) => (i.services.length ? i.services : ["multi"]);
  const incInScope = (i) => inR(i.region) && incSvcs(i).some(inS);
  const matchSel = (i) => !state.sel || (i.region === state.sel.region && incSvcs(i).includes(state.sel.svc));

  function computeVerdict(d) {
    if (!scopeOn()) return { level: d.overall.level, reasons: d.overall.reasons, scoped: false };
    let rank = 0;
    const reasons = [];
    for (const i of d.incidents) {
      if (i.status !== "active" || i.severity === "ok" || !incInScope(i)) continue;
      rank = Math.max(rank, RANK[i.severity]);
      reasons.push({ code: "incident", incidentId: i.id, region: i.region, service: incSvcs(i)[0] });
    }
    const byRegion = new Map();
    for (const p of d.probes) {
      if (p.streak >= 2 && inR(p.region) && inS(p.service)) byRegion.set(p.region, (byRegion.get(p.region) ?? 0) + 1);
    }
    for (const [region, n] of byRegion) { rank = Math.max(rank, 2); reasons.push({ code: "probe", region, n }); }
    let level = LEVELS[rank];
    if (level === "ok" && d.overall.level === "unknown") level = "unknown";
    if (!d.sources.aws.ok) reasons.push({ code: "feed_error" });
    return { level, reasons, scoped: true, globalLevel: d.overall.level };
  }

  /* ------------------------------------------------------------------ hücre hesabı */
  function computeCells(d) {
    const cells = new Map();
    const put = (svc, region, lvl, info) => {
      const k = `${svc}|${region}`;
      let c = cells.get(k);
      if (!c) { c = { level: "ok", incidents: [], probes: [] }; cells.set(k, c); }
      if (RANK[lvl] > RANK[c.level]) c.level = lvl;
      if (info.incident) c.incidents.push(info.incident);
      if (info.probe) c.probes.push(info.probe);
    };
    for (const inc of d.incidents) {
      if (inc.status !== "active" || inc.severity === "ok") continue;
      for (const s of incSvcs(inc)) put(s, inc.region, inc.severity, { incident: inc });
    }
    for (const p of d.probes) {
      const lvl = p.streak >= 2 ? "degraded" : !p.ok ? "info" : "ok";
      put(p.service, p.region, lvl, { probe: p });
    }
    return cells;
  }

  /* ------------------------------------------------------------------ tooltip */
  const tip = () => $("#tip");
  function showTip(el, nodes) {
    const t0 = tip();
    t0.replaceChildren(...nodes);
    t0.hidden = false;
    const r = el.getBoundingClientRect();
    const w = t0.offsetWidth, hgt = t0.offsetHeight;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    let top = r.bottom + 8;
    if (top + hgt > window.innerHeight - 8) top = Math.max(8, r.top - hgt - 8);
    t0.style.left = `${left}px`;
    t0.style.top = `${top}px`;
  }
  const hideTip = () => { tip().hidden = true; };
  function bindTip(el, build) {
    el.addEventListener("pointerenter", () => showTip(el, build()));
    el.addEventListener("focus", () => showTip(el, build()));
    el.addEventListener("pointerleave", hideTip);
    el.addEventListener("blur", hideTip);
  }

  /* ------------------------------------------------------------------ çizim: üst bölüm */
  function renderChrome() {
    document.documentElement.lang = state.lang;
    for (const el of $$("[data-i18n]")) el.textContent = t(el.dataset.i18n);
    for (const el of $$("[data-i18n-ph]")) el.setAttribute("placeholder", t(el.dataset.i18nPh));
    $("#lang-label").textContent = state.lang === "tr" ? "EN" : "TR";
    $("#theme-label").textContent = t(`theme_${state.theme}`);
    $("#refresh-label").textContent = t("refresh");
    $("#foot-text").textContent = t("foot_text");
    const nb = $("#btn-notify");
    const supported = typeof Notification !== "undefined";
    const denied = supported && Notification.permission === "denied";
    nb.setAttribute("aria-pressed", String(state.notify));
    nb.disabled = !supported || denied;
    $("#notify-label").textContent = !supported ? t("notify_unsupported") : denied ? t("notify_denied") : state.notify ? t("notify_on") : t("notify_off");
    $("#chk-mine").checked = state.mine;
  }

  function renderVerdict() {
    const d = state.data;
    const title = $("#verdict-title"), sub = $("#verdict-sub"), lamp = $("#lamp"), root = $("#verdict");
    const reasons = $("#reasons"), chips = $("#chips"), banner = $("#banner");

    // Uyarı şeridi
    const stale = d && Date.now() - d.updatedAt > STALE_MS;
    if (state.offline || stale) {
      banner.hidden = false;
      banner.textContent = state.offline ? t("offline_warn") : t("stale_warn", { ago: ago(d.updatedAt) });
    } else banner.hidden = true;

    if (!d) {
      const lvl = "unknown";
      root.dataset.l = lvl; lamp.dataset.l = lvl; lamp.textContent = GLYPH[lvl];
      title.textContent = state.nodata ? t("nodata_title") : t("loading_title");
      sub.textContent = state.nodata ? t("nodata_sub") : "";
      reasons.replaceChildren(); chips.replaceChildren();
      return;
    }

    const v = computeVerdict(d);
    root.dataset.l = v.level; lamp.dataset.l = v.level; lamp.textContent = GLYPH[v.level];
    title.textContent = t(v.scoped && v.level !== "unknown" ? `verdict_mine_${v.level}` : `verdict_${v.level}`);

    const activeN = d.incidents.filter((i) => i.status === "active" && i.severity !== "ok" && (!v.scoped || incInScope(i))).length;
    const parts = [activeN ? t("sub_n", { n: activeN }) : t("sub_none"), t("sub_checked", { ago: ago(d.updatedAt) })];
    if (v.scoped && v.globalLevel && RANK[v.globalLevel] > RANK[v.level] && v.globalLevel !== "unknown") {
      parts.push(t("sub_elsewhere", { level: t(`level_${v.globalLevel}`) }));
    }
    sub.textContent = parts.join(" ");

    // Nedenler
    const lis = v.reasons.slice(0, 4).map((r) => reasonItem(r, d));
    if (v.reasons.length > 4) lis.push(h("li", { "data-l": "unknown" }, t("reason_more", { n: v.reasons.length - 4 })));
    reasons.replaceChildren(...lis);

    // Kaynak çipleri
    const s = d.sources;
    const chipList = [];
    chipList.push(chip(s.aws.ok ? "ok" : "degraded", s.aws.ok ? t("chip_aws_ok", { ms: s.aws.ms }) : t("chip_aws_err")));
    if (s.probes.total === 0) chipList.push(chip("unknown", t("chip_probe_none")));
    else chipList.push(chip(s.probes.failed === 0 ? "ok" : s.probes.failed === s.probes.total ? "degraded" : "info", t("chip_probe", { ok: s.probes.total - s.probes.failed, total: s.probes.total })));
    if (!s.downdetector.enabled) chipList.push(chip("unknown", t("chip_dd_off")));
    else {
      const st = s.downdetector.ok ? s.downdetector.state : "unknown";
      chipList.push(chip(st === "ok" ? "ok" : st === "unknown" ? "unknown" : "info", t(`chip_dd_${st}`)));
    }
    chips.replaceChildren(...chipList);
  }
  const chip = (lvl, text) => h("li", { class: "chip", "data-l": lvl }, text);

  function reasonItem(r, d) {
    if (r.code === "incident") {
      const inc = d.incidents.find((i) => i.id === r.incidentId);
      return h("li", { "data-l": inc ? inc.severity : "degraded" },
        t("reason_incident", { svc: sLabel(r.service || "multi"), region: rLabel(r.region), title: inc ? trTitle(inc.title) : "" }));
    }
    if (r.code === "probe") return h("li", { "data-l": "degraded" }, t("reason_probe", { region: rLabel(r.region), n: r.n ?? 1 }));
    if (r.code === "downdetector_unconfirmed") return h("li", { "data-l": "info" }, t("reason_dd_un"));
    if (r.code === "downdetector_confirms") return h("li", { "data-l": "info" }, t("reason_dd_ok"));
    return h("li", { "data-l": "unknown" }, t("reason_feed"));
  }

  /* ------------------------------------------------------------------ izleme listesi */
  function buildPickers() {
    const d = state.data;
    if (!d) return;
    const key = `${state.lang}|${d.catalog.coreRegions.length}|${d.catalog.coreServices.length}`;
    if (state.pickersBuilt === key) return;
    state.pickersBuilt = key;

    const regions = [...d.catalog.coreRegions.filter((r) => r !== "global"), ...Object.keys(d.catalog.regions).filter((r) => r !== "global" && !d.catalog.coreRegions.includes(r))];
    const services = [...d.catalog.coreServices];
    const box = (set, value, label, small) =>
      h("label", null,
        h("input", {
          type: "checkbox", checked: set.has(value) ? "" : null,
          onchange: (e) => { e.target.checked ? set.add(value) : set.delete(value); persistWatch(); renderAll(); },
        }),
        h("span", null, label, small ? h("small", null, ` ${small}`) : null));
    $("#pick-regions-panel").replaceChildren(...regions.map((r) => box(state.watchR, r, r, d.catalog.regions[r])));
    $("#pick-services-panel").replaceChildren(...services.map((s) => box(state.watchS, s, d.catalog.services[s] || s)));
  }
  function renderWatch() {
    const sum = (set, label) => `${label}: ${set.size ? t("f_n", { n: set.size }) : t("f_all")}`;
    $("#pick-regions-sum").textContent = sum(state.watchR, t("f_regions"));
    $("#pick-services-sum").textContent = sum(state.watchS, t("f_services"));
    $("#btn-clear-watch").hidden = state.watchR.size + state.watchS.size === 0;
  }
  function syncCheckboxes() {
    const d = state.data;
    if (!d) return;
    const regions = [...d.catalog.coreRegions.filter((r) => r !== "global"), ...Object.keys(d.catalog.regions).filter((r) => r !== "global" && !d.catalog.coreRegions.includes(r))];
    $$("input", $("#pick-regions-panel")).forEach((cb, i) => { cb.checked = state.watchR.has(regions[i]); });
    $$("input", $("#pick-services-panel")).forEach((cb, i) => { cb.checked = state.watchS.has(d.catalog.coreServices[i]); });
  }
  function persistWatch() {
    store.set("watchR", [...state.watchR].join(","));
    store.set("watchS", [...state.watchS].join(","));
    store.set("mine", state.mine ? "1" : "0");
    const p = new URLSearchParams();
    if (state.watchR.size) p.set("r", [...state.watchR].join(","));
    if (state.watchS.size) p.set("s", [...state.watchS].join(","));
    if (state.mine) p.set("mine", "1");
    const qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? `?${qs}` : "") + location.hash); } catch { /* yok say */ }
  }

  /* ------------------------------------------------------------------ ısı haritası */
  function renderBoard() {
    const d = state.data;
    const host = $("#hm-scroll");
    if (!d) { host.replaceChildren(); return; }
    const cells = computeCells(d);
    const c = d.catalog;

    // Sütunlar
    const extraR = [...new Set([...cells.keys()].map((k) => k.split("|")[1]))].filter((r) => !c.coreRegions.includes(r)).sort();
    let regions = [...c.coreRegions.filter((r) => r !== "global"), ...extraR, "global"];
    if (scopeOn() && state.watchR.size) regions = regions.filter(inR);
    regions.sort((a, b) => (state.watchR.has(b) ? 1 : 0) - (state.watchR.has(a) ? 1 : 0));

    // Satırlar
    const issueSvcs = new Set();
    for (const [k, v] of cells) if (v.level !== "ok") issueSvcs.add(k.split("|")[0]);
    const extraS = [...new Set([...cells.keys()].map((k) => k.split("|")[0]))].filter((s) => s !== "multi" && !c.coreServices.includes(s)).sort();
    const everyRow = [...c.coreServices, ...extraS];
    let rows;
    if (scopeOn() && state.watchS.size) rows = everyRow.filter((s) => state.watchS.has(s));
    else if (state.allRows) rows = everyRow;
    else {
      const key = [...state.watchS, ...KEY_ROWS, ...d.meta.probeServices, ...issueSvcs];
      rows = [...new Set(key)].filter((s) => s !== "multi" && everyRow.includes(s));
      rows.sort((a, b) => (state.watchS.has(b) ? 1 : 0) - (state.watchS.has(a) ? 1 : 0));
    }
    if (issueSvcs.has("multi")) rows.push("multi");

    const keep = host.scrollLeft;
    const thead = h("thead", null, h("tr", null,
      h("th", { class: "corner" }),
      ...regions.map((r) =>
        h("th", { scope: "col", class: state.watchR.has(r) ? "watched" : "", title: rLabel(r) }, h("span", { class: "vt" }, r === "global" ? t("global") : r)))));
    const tbody = h("tbody", null, ...rows.map((svc, ri) =>
      h("tr", null,
        h("th", { scope: "row", class: state.watchS.has(svc) ? "watched" : "" }, sLabel(svc)),
        ...regions.map((region, ci) => {
          const cell = cells.get(`${svc}|${region}`);
          const lvl = cell ? cell.level : "ok";
          const selected = state.sel && state.sel.svc === svc && state.sel.region === region;
          const btn = h("button", {
            type: "button", class: `cell${state.sel && !selected ? " dim" : ""}`, "data-l": lvl,
            "aria-pressed": String(!!selected),
            "aria-label": `${sLabel(svc)}, ${region}: ${t(`level_${lvl}`)}`,
            onclick: () => {
              state.sel = selected ? null : { svc, region };
              state.shown = 20;
              renderBoard(); renderSelection(); renderActive(); renderHistory();
            },
          }, lvl === "ok" ? null : GLYPH[lvl]);
          btn.style.setProperty("--i", String(ri + ci));
          bindTip(btn, () => cellTip(svc, region, cell));
          return h("td", null, btn);
        }))));
    const table = h("table", { class: `hm${state.introDone ? "" : " intro"}`, "aria-label": t("board_title") }, thead, tbody);
    host.replaceChildren(table);
    host.scrollLeft = keep;
    state.introDone = true;

    // Açıklama ve düğmeler
    $("#legend").replaceChildren(...LEVELS.map((l) => h("li", { "data-l": l }, h("i", null, GLYPH[l]), t(`legend_${l}`))));
    const toggle = $("#btn-rows");
    const hideToggle = scopeOn() && state.watchS.size > 0;
    toggle.hidden = hideToggle;
    toggle.textContent = state.allRows ? t("rows_less") : t("rows_more", { n: everyRow.length });
  }
  function cellTip(svc, region, cell) {
    const lvl = cell ? cell.level : "ok";
    const nodes = [h("strong", null, `${sLabel(svc)}, ${rLabel(region)}`), t(`level_${lvl}`)];
    if (!cell || (!cell.incidents.length && lvl === "ok")) nodes.push(h("div", null, t("tip_ok")));
    for (const i of cell?.incidents ?? []) nodes.push(h("div", null, trTitle(i.title)));
    for (const p of cell?.probes ?? []) {
      nodes.push(h("div", null, !p.ok ? t("tip_probe_fail") : p.slow ? t("tip_probe_slow", { ms: p.ms }) : t("tip_probe", { ms: p.ms })));
    }
    return nodes;
  }
  function renderSelection() {
    const box = $("#selection");
    if (!state.sel) { box.hidden = true; box.replaceChildren(); return; }
    box.hidden = false;
    box.replaceChildren(
      h("span", null, t("sel_label", { what: `${sLabel(state.sel.svc)}, ${rLabel(state.sel.region)}` })),
      h("button", { type: "button", onclick: () => { state.sel = null; renderBoard(); renderSelection(); renderActive(); renderHistory(); } }, t("sel_clear")));
  }

  /* ------------------------------------------------------------------ olaylar */
  const sevTag = (lvl) => h("span", { class: "sev", "data-l": lvl }, h("i", null, GLYPH[lvl]), t(`level_${lvl}`));

  function timeline(inc) {
    return h("ol", { class: "timeline" },
      ...[...inc.updates].reverse().map((u) => h("li", null, h("time", null, fmtDT(u.ts)), h("p", null, u.text || trTitle(u.title)))));
  }
  function renderActive() {
    const d = state.data;
    const root = $("#active-list");
    if (!d) { root.replaceChildren(); return; }
    const all = d.incidents.filter((i) => i.status === "active" && i.severity !== "ok");
    const list = all.filter((i) => incInScope(i) && matchSel(i)).sort((a, b) => RANK[b.severity] - RANK[a.severity] || b.lastTs - a.lastTs);
    if (!list.length) {
      if (all.length && (state.sel || scopeOn())) { root.replaceChildren(h("div", { class: "empty" }, t("no_match"))); return; }
      const recent = d.incidents.filter((i) => i.lastTs >= Date.now() - 30 * 86400_000).length;
      root.replaceChildren(h("div", { class: "empty", "data-l": "ok" },
        h("strong", null, t("active_empty")), recent ? t("active_empty_sub", { n: recent }) : t("active_empty_sub0")));
      return;
    }
    root.replaceChildren(...list.map((inc) =>
      h("article", { class: "inc", "data-l": inc.severity },
        sevTag(inc.severity),
        h("h3", { class: "inc-title" }, trTitle(inc.title)),
        h("p", { class: "inc-meta" }, `${incSvcs(inc).map(sLabel).join(", ")}, ${rLabel(inc.region)}`),
        h("p", { class: "inc-time" }, `${t("started", { ago: ago(inc.firstTs) })}, ${t("last_upd", { ago: ago(inc.lastTs) })}`),
        h("details", null, h("summary", null, t("upd_n", { n: inc.updates.length })), timeline(inc)))));
  }

  function renderHistory() {
    const d = state.data;
    const root = $("#hist-list"), more = $("#btn-more");
    const stSel = $("#f-status"), svSel = $("#f-sev");
    if (!stSel.options.length || stSel.dataset.lang !== state.lang) {
      stSel.dataset.lang = state.lang;
      stSel.replaceChildren(...[["all", t("st_all")], ["active", t("st_active")], ["resolved", t("st_resolved")], ["stale", t("st_stale")]].map(([v, l]) => h("option", { value: v }, l)));
      svSel.replaceChildren(...[["all", t("sev_all")], ["info", t("level_info")], ["degraded", t("level_degraded")], ["disruption", t("level_disruption")]].map(([v, l]) => h("option", { value: v }, l)));
      stSel.value = state.fStatus; svSel.value = state.fSev;
    }
    if (!d) { root.replaceChildren(); more.hidden = true; return; }

    const q = state.q.trim().toLowerCase();
    const list = d.incidents.filter((i) => {
      if (!incInScope(i) || !matchSel(i)) return false;
      if (state.fStatus !== "all" && i.status !== state.fStatus) return false;
      if (state.fSev !== "all" && i.peak !== state.fSev) return false;
      if (!q) return true;
      const hay = `${i.title} ${trTitle(i.title)} ${i.region} ${rName(i.region)} ${incSvcs(i).map(sLabel).join(" ")} ${i.updates.map((u) => u.text).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    if (!list.length) { root.replaceChildren(h("div", { class: "empty", style: "padding:18px 0" }, t("hist_empty"))); more.hidden = true; return; }

    const shown = list.slice(0, state.shown);
    root.replaceChildren(...shown.map((inc) => {
      const end = inc.status === "resolved" ? inc.resolvedTs : Date.now();
      const durText = inc.status === "active" ? t("ongoing") : inc.status === "stale"
        ? t("stale_note", { h: Math.round((Date.now() - inc.lastTs) / 3600_000) })
        : t("dur", { d: dur(end - inc.firstTs) });
      const lvl = inc.status === "resolved" ? "ok" : inc.severity;
      return h("details", { class: "h", "data-l": lvl },
        h("summary", null,
          sevTag(lvl === "ok" ? "ok" : lvl),
          h("span", { class: "h-title" }, trTitle(inc.title)),
          h("span", { class: "h-dur" }, durText),
          h("span", { class: "h-meta" }, `${incSvcs(inc).map(sLabel).join(", ")}, ${rLabel(inc.region)}, ${fmtDT(inc.firstTs)}${inc.peak !== "ok" && inc.status === "resolved" ? `, ${t("peak", { level: t(`level_${inc.peak}`) })}` : ""}`)),
        timeline(inc));
    }));
    const left = list.length - shown.length;
    more.hidden = left <= 0;
    more.textContent = t("more", { n: left });
  }

  /* ------------------------------------------------------------------ grafik */
  function renderTrend() {
    const d = state.data, root = $("#trend-chart");
    if (!d) { root.replaceChildren(); return; }
    const pts = d.history;
    if (pts.length < 3) { root.replaceChildren(h("div", { class: "empty" }, t("trend_empty"))); return; }
    const W = 760, H = 210, L = 46, R = 14, T = 14, B = 28;
    const end = d.updatedAt, start = end - 86400_000;
    const x = (ts) => L + ((ts - start) / (end - start)) * (W - L - R);
    const maxMs = Math.max(300, Math.ceil(Math.max(...pts.map((p) => p.m ?? 0)) / 100) * 100);
    const y = (ms) => T + (1 - ms / maxMs) * (H - T - B);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${t("trend_title")}: ${t("trend_desc")}` });

    for (const f of [0, 0.5, 1]) {
      svg.append(sv("line", { class: "grid", x1: L, x2: W - R, y1: y(maxMs * f), y2: y(maxMs * f) }));
      svg.append(sv("text", { class: "axis", x: L - 8, y: y(maxMs * f) + 4, "text-anchor": "end" }, `${Math.round(maxMs * f)}`));
    }
    svg.append(sv("text", { class: "axis", x: 0, y: 10 }, "ms"));
    for (let i = 0; i <= 4; i++) {
      const ts = start + (i * 6 * 3600_000);
      svg.append(sv("text", { class: "axis", x: x(ts), y: H - 6, "text-anchor": i === 0 ? "start" : i === 4 ? "end" : "middle" }, fmtTime(ts)));
    }
    // Sorunlu dönem bantları
    pts.forEach((p, i) => {
      if (p.l < 1) return;
      const t0 = p.t * 1000, t1 = i + 1 < pts.length ? pts[i + 1].t * 1000 : t0 + 300_000;
      svg.append(sv("rect", { class: "band", "data-l": LEVELS[p.l], x: x(t0), y: T, width: Math.max(2, x(t1) - x(t0)), height: H - T - B }));
    });
    // Çizgi (boşluklarda kırılır)
    let seg = [];
    const flush = () => { if (seg.length > 1) svg.append(sv("polyline", { class: "line", points: seg.join(" ") })); seg = []; };
    let prevT = null;
    for (const p of pts) {
      const ts = p.t * 1000;
      if (p.m == null || (prevT != null && ts - prevT > 900_000)) flush();
      if (p.m != null) seg.push(`${x(ts).toFixed(1)},${y(p.m).toFixed(1)}`);
      prevT = ts;
    }
    flush();
    const last = [...pts].reverse().find((p) => p.m != null);
    if (last) {
      svg.append(sv("circle", { cx: x(last.t * 1000), cy: y(last.m), r: 4, fill: "var(--ink)" }));
      svg.append(sv("text", { class: "axis", x: x(last.t * 1000) - 8, y: y(last.m) - 9, "text-anchor": "end", fill: "var(--ink)" }, `${last.m} ms`));
    }
    root.replaceChildren(svg);
  }

  /* ------------------------------------------------------------------ sondalar */
  function spark(values) {
    const nums = values.map((v) => (v == null ? null : v));
    const ok = nums.filter((v) => v != null);
    const svg = sv("svg", { class: "spark", viewBox: "0 0 110 26", "aria-hidden": "true" });
    if (ok.length < 2) return svg;
    const max = Math.max(...ok), min = Math.min(...ok), span = Math.max(1, max - min);
    const pts = [];
    nums.forEach((v, i) => { if (v != null) pts.push(`${((i / Math.max(1, nums.length - 1)) * 108 + 1).toFixed(1)},${(23 - ((v - min) / span) * 20).toFixed(1)}`); });
    svg.append(sv("polyline", { points: pts.join(" ") }));
    return svg;
  }
  function renderProbes() {
    const d = state.data, tbl = $("#ptable");
    if (!d) { tbl.replaceChildren(); return; }
    const services = d.meta.probeServices.filter((s) => d.probes.some((p) => p.service === s));
    if (!services.length) { tbl.replaceChildren(h("tbody", null, h("tr", null, h("td", null, t("p_none"))))); return; }
    const head = h("thead", null, h("tr", null, h("th", null, t("p_region")), ...services.map((s) => h("th", null, sLabel(s))), h("th", null, t("p_trend"))));
    const body = h("tbody", null, ...d.meta.probeRegions.map((region) =>
      h("tr", null,
        h("th", { scope: "row" }, region, h("small", null, rName(region))),
        ...services.map((s) => {
          const p = d.probes.find((x) => x.service === s && x.region === region);
          if (!p) return h("td", null, "-");
          if (!p.ok) return h("td", null, h("span", { class: "pv bad", "data-l": "disruption", title: p.err || "" }, t("p_fail")));
          return h("td", null, h("span", { class: p.slow ? "pv slow" : "pv", "data-l": p.slow ? "degraded" : "ok" }, `${p.ms} ms`, p.slow ? ` ${t("p_slow")}` : ""));
        }),
        h("td", null, spark(d.probeSeries[region] || [])))));
    tbl.replaceChildren(head, body);
  }

  /* ------------------------------------------------------------------ 90 gün */
  function renderUptime() {
    const d = state.data, bars = $("#uptime-bars");
    if (!d) { bars.replaceChildren(); return; }
    const map = new Map(d.days.map((x) => [x.d, x]));
    const base = new Date(d.updatedAt);
    const items = [];
    let n = 0, bad = 0;
    for (let i = 89; i >= 0; i--) {
      const dt = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() - i));
      const key = dt.toISOString().slice(0, 10);
      const day = map.get(key);
      let lvl = "none", tipText = t("day_none", { date: fmtDate(dt.getTime()) });
      if (day && day.n > 0) {
        lvl = day.o > 0 ? "disruption" : day.x > 0 ? "degraded" : day.w > 0 ? "info" : "ok";
        n += day.n; bad += day.x + day.o;
        tipText = t("day_tip", { date: fmtDate(dt.getTime()), n: day.n, bad: day.x + day.o });
      }
      const bar = h("div", { class: "bar", "data-l": lvl, tabindex: "0", "aria-label": tipText });
      bindTip(bar, () => [tipText]);
      items.push(bar);
    }
    bars.replaceChildren(...items);
    bars.setAttribute("aria-label", t("uptime_title"));
    const sum = $("#uptime-sum");
    if (n < 12) sum.textContent = t("uptime_sum_none");
    else sum.textContent = t("uptime_sum", { pct: new Intl.NumberFormat(loc(), { maximumFractionDigits: 2 }).format((1 - bad / n) * 100) });
    $("#uptime-note").textContent = d.meta.firstSeen ? t("uptime_since", { date: fmtDate(d.meta.firstSeen) }) : "";
  }

  /* ------------------------------------------------------------------ veri ve güvenilirlik */
  function renderAbout() {
    const d = state.data, root = $("#about-body");
    if (!d) { root.replaceChildren(); return; }
    const m = d.meta, s = d.sources;
    const fact = (value, label) => h("div", { class: "fact" }, h("b", null, value), h("span", null, label));
    const facts = h("div", { class: "facts" },
      fact(t("fact_interval_v", { n: m.intervalMin }), t("fact_interval")),
      fact(t("fact_ui_v", { n: m.uiRefreshSec }), t("fact_ui")),
      fact(ago(d.updatedAt), t("fact_age")),
      fact(m.firstSeen ? fmtDate(m.firstSeen) : "-", t("fact_since")));

    const meter = (n) => h("span", { class: "meter", "aria-hidden": "true" }, ...[1, 2, 3, 4].map((i) => h("i", { class: i <= n ? "on" : "" })));
    const src = (name, sub, trust, rows) =>
      h("article", { class: "src" },
        h("div", null, h("h3", null, name), h("p", { class: "src-sub" }, sub),
          h("p", { class: "trust" }, meter(trust), `${t("trust")}: ${t(`trust_${trust}`)}`)),
        h("dl", null, ...rows.flatMap(([k, v, lvl]) => [h("dt", null, k), h("dd", null, lvl ? h("span", { class: "live", "data-l": lvl }, rich(v)) : rich(v))])));

    const awsNow = s.aws.ok ? t("src1_now", { ms: s.aws.ms, items: s.aws.items ?? 0, ago: ago(d.updatedAt) }) : t("src1_now_err", { err: s.aws.error || "?" });
    const probeNow = s.probes.total ? t("src2_now", { ok: s.probes.total - s.probes.failed, total: s.probes.total, ms: s.probes.ms ?? "-" }) : t("src2_now_none");
    const ddState = !s.downdetector.enabled ? "off" : s.downdetector.ok ? s.downdetector.state : "unknown";
    const ddLvl = ddState === "ok" ? "ok" : ddState === "unknown" || ddState === "off" ? "unknown" : "info";

    const sources = [
      src(t("src1_name"), t("src1_sub"), 4, [
        [t("dt_what"), t("src1_what")],
        [t("dt_how"), t("src1_how", { url: m.feedUrl })],
        [t("dt_when"), t("src1_when", { n: m.intervalMin })],
        [t("dt_limit"), t("src1_limit")],
        [t("dt_now"), awsNow, s.aws.ok ? "ok" : "degraded"],
      ]),
      src(t("src2_name"), t("src2_sub"), 3, [
        [t("dt_what"), t("src2_what")],
        [t("dt_how"), t("src2_how", { regions: m.probeRegions.length, services: m.probeServices.map(sLabel).join(", "), total: s.probes.total, timeout: Math.round(m.probeTimeoutMs / 1000) })],
        [t("dt_when"), t("src2_when", { n: m.intervalMin })],
        [t("dt_limit"), t("src2_limit")],
        [t("dt_now"), probeNow, s.probes.total === 0 ? "unknown" : s.probes.failed === 0 ? "ok" : "info"],
      ]),
      src(t("src3_name"), t("src3_sub"), 1, [
        [t("dt_what"), t("src3_what")],
        [t("dt_how"), t("src3_how", { url: m.ddUrl })],
        [t("dt_when"), t("src3_when", { n: m.intervalMin })],
        [t("dt_limit"), t("src3_limit")],
        [t("dt_now"), t(`src3_now_${ddState}`), ddLvl],
      ]),
    ];

    const levels = h("ul", { class: "levels" }, ...["ok", "info", "degraded", "disruption", "unknown"].map((l) =>
      h("li", { "data-l": l }, sevTag(l), h("span", null, t(`lv_${l}`)))));
    const limits = h("ul", { class: "limits" },
      h("li", null, rich(t("lim1"))), h("li", null, rich(t("lim2", { h: m.activeHours }))),
      h("li", null, rich(t("lim3"))), h("li", null, rich(t("lim4"))),
      state.lang === "tr" ? h("li", null, rich(t("lim5"))) : null);

    root.replaceChildren(facts, ...sources, h("h3", { class: "sub" }, t("levels_title")), levels, h("h3", { class: "sub" }, t("limits_title")), limits);
  }

  /* ------------------------------------------------------------------ sekme başlığı */
  function renderMeta() {
    const d = state.data;
    const level = d ? computeVerdict(d).level : "unknown";
    document.title = `${EMOJI[level]} ${t("brand")}`;
    const icon = $("#favicon");
    const glyph = level === "ok" ? '<path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : "";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${FAVICON[level]}"/>${glyph}</svg>`;
    icon.setAttribute("href", `data:image/svg+xml,${encodeURIComponent(svg)}`);
  }

  function renderAll() {
    renderChrome();
    buildPickers();
    syncCheckboxes();
    renderWatch();
    renderVerdict();
    renderBoard();
    renderSelection();
    renderActive();
    renderTrend();
    renderProbes();
    renderUptime();
    renderHistory();
    renderAbout();
    renderMeta();
  }
  /** Veri değişmeden zamanla değişen metinler (göreli zamanlar). */
  function renderTimes() {
    renderVerdict();
    renderAbout();
  }

  /* ------------------------------------------------------------------ veri çekme */
  let retryTimer = null;
  async function load(manual) {
    const btn = $("#btn-refresh");
    if (manual) { btn.classList.add("busy"); $("#refresh-label").textContent = t("refreshing"); }
    let retrySoon = false;
    try {
      const res = await fetch(API, { cache: "no-store", signal: typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(25000) : undefined });
      if (res.status === 503) {
        state.nodata = !state.data; state.offline = !!state.data; retrySoon = true;
      } else {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        if (!d || d.v !== 2 || !d.overall) throw new Error("format");
        const before = state.data ? computeVerdict(state.data).level : null;
        state.data = d; state.offline = false; state.nodata = false;
        const after = computeVerdict(d).level;
        maybeNotify(before, after);
      }
      state.lastFetch = Date.now();
    } catch (e) {
      state.offline = true;
      retrySoon = true;
    } finally {
      btn.classList.remove("busy");
      renderAll();
      clearTimeout(retryTimer);
      if (retrySoon) retryTimer = setTimeout(() => load(false), 12_000);
    }
  }
  function maybeNotify(before, after) {
    if (!state.notify || before == null || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (RANK[after] > RANK[before]) {
      try { new Notification(t("notif_title"), { body: t(`verdict_${after}`), tag: "aws-status" }); } catch { /* yok say */ }
    }
  }

  /* ------------------------------------------------------------------ olaylar ve başlangıç */
  function init() {
    const p = new URLSearchParams(location.search);
    const list = (v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : []);
    const urlHasWatch = p.has("r") || p.has("s") || p.has("mine");
    state.lang = p.get("lang") === "en" ? "en" : p.get("lang") === "tr" ? "tr" : store.get("lang", (navigator.language || "tr").toLowerCase().startsWith("tr") ? "tr" : "en");
    state.theme = ["light", "dark"].includes(store.get("theme", "auto")) ? store.get("theme", "auto") : "auto";
    state.watchR = new Set(list(urlHasWatch ? p.get("r") : store.get("watchR", "")));
    state.watchS = new Set(list(urlHasWatch ? p.get("s") : store.get("watchS", "")));
    state.mine = urlHasWatch ? p.get("mine") === "1" : store.get("mine", "0") === "1";
    state.notify = store.get("notify", "0") === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
    state.allRows = store.get("allRows", "0") === "1";
    applyTheme();

    $("#btn-lang").addEventListener("click", () => {
      state.lang = state.lang === "tr" ? "en" : "tr"; store.set("lang", state.lang); state.pickersBuilt = ""; renderAll();
    });
    $("#btn-theme").addEventListener("click", () => {
      state.theme = state.theme === "auto" ? "light" : state.theme === "light" ? "dark" : "auto";
      store.set("theme", state.theme); applyTheme(); renderChrome();
    });
    $("#btn-notify").addEventListener("click", async () => {
      if (typeof Notification === "undefined") return;
      if (state.notify) state.notify = false;
      else {
        const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
        state.notify = perm === "granted";
      }
      store.set("notify", state.notify ? "1" : "0"); renderChrome();
    });
    $("#btn-refresh").addEventListener("click", () => load(true));
    $("#chk-mine").addEventListener("change", (e) => { state.mine = e.target.checked; persistWatch(); renderAll(); });
    $("#btn-clear-watch").addEventListener("click", () => { state.watchR.clear(); state.watchS.clear(); state.mine = false; persistWatch(); renderAll(); });
    $("#btn-rows").addEventListener("click", () => { state.allRows = !state.allRows; store.set("allRows", state.allRows ? "1" : "0"); renderBoard(); });
    let qTimer;
    $("#q").addEventListener("input", (e) => { clearTimeout(qTimer); qTimer = setTimeout(() => { state.q = e.target.value; state.shown = 20; renderHistory(); }, 150); });
    $("#f-status").addEventListener("change", (e) => { state.fStatus = e.target.value; state.shown = 20; renderHistory(); });
    $("#f-sev").addEventListener("change", (e) => { state.fSev = e.target.value; state.shown = 20; renderHistory(); });
    $("#btn-more").addEventListener("click", () => { state.shown += 20; renderHistory(); });

    document.addEventListener("click", (e) => {
      for (const dEl of $$("details.pick")) if (dEl.open && !dEl.contains(e.target)) dEl.open = false;
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") for (const dEl of $$("details.pick")) dEl.open = false;
      if (e.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || "")) { e.preventDefault(); $("#q").focus(); }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && Date.now() - state.lastFetch > 30_000) load(false);
    });

    renderAll();
    load(false);
    setInterval(() => { if (!document.hidden) load(false); }, 60_000);
    setInterval(renderTimes, 30_000);
  }
  function applyTheme() {
    if (state.theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = state.theme;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
