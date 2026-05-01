# BioStatQuest v2.0 — Product Strategy

## 0. v1.0'a dair eleştirel teşhis

Çıkardığım haritaya göre v1 sağlam bir **bilgi teslim platformu** ama hâlâ bir **öğrenme motoru** değil. En kritik yapısal gerçekler:

1. **Soru içeriği koddan ibaret** (`src/data/cases.ts`, 4.183 satır). İçerik iterasyonu = deploy. Bu, IRT kalibrasyonu, A/B pedagoji testi ve içerik sürüm yönetimini imkânsız kılıyor.
2. **Telemetri yok** — `srs.reps/stability` ve case skoru dışında hiçbir öğrenme verisi toplanmıyor. Soru güçlüğü, ayırt edicilik, distractor başına seçim oranı, yanlış cevap → düzelme süreci hiç ölçülmüyor. Bu olmadan "adaptive" hiçbir şey yapılamaz.
3. **Pedagojik dar boğaz**: tek bir `explain` alanı her doğru ve yanlış cevap için aynı metni veriyor. Bu, bütün distractor'ların eşit pedagojik değer taşıdığını söylemekle aynı şey — değil.
4. **CasePlay'in akışı statik**: rastgele soru, sabit zaman, sabit zorluk. FSRS yalnızca "Daily Review" modunda devreye giriyor — gerçek case'lerde içeriği yönlendirmiyor.
5. **Akademik kanal eksik**: Instructor view var ama LMS köprüsü, ödev planlayıcı, gradebook, item analysis yok. Üniversiteler için "deneyin" diyebileceğin somut bir kanca yok.
6. **Veri gerçeği eksik**: `output` alanı R/SAS çıktısı için var ama gerçek veri seti üzerinde "yap-gör" deneyimi yok. Biostat öğrenmenin kalbi bu.
7. **Mimari borç**: `App.tsx` 7.700 satır. Phase 6'da SkillTree ayrıştı; iyi gidiş ama route bazlı kod bölme + sayfa bazlı view dosyaları daha agresif sürdürülmeli.

**v2.0'ın tek cümlelik tezi**: "Soru bankasından, ölçen-kalibre eden-kişiselleştiren bir biyoistatistik öğrenme motoruna geçmek."

---

## 1. v2.0 Vision

> **BioStatQuest v2.0**, biyoistatistik öğrenmeyi ölçen bir motor: her cevabı kalibrasyon sinyaline çevirir, her yanlışı bir kavram yanlış-modeline bağlar, her case'i öğrenenin gerçek zayıf noktasına yönlendirir, ve eğitimcilere sınıflarını gerçekten yönetebilecekleri bir kontrol paneli verir. Hem bireysel öğrenci hem de üniversite kursu için "varsayılan biyoistatistik altyapısı" olmayı hedefler.

Üç stratejik direk:

- **A — Pedagoji derinliği**: tek `.explain`'den çok katmanlı geri bildirime, hint sistemine, manuscript-style yazma egzersizine.
- **B — Adaptif motor**: IRT kalibrasyonlu zorluk + Bayesian/logistic mastery + öğrenen modeli + "next best item" önerisi.
- **C — Akademik dağıtım**: gradebook, ödev, LTI/Canvas entegrasyonu, kurum lisansı.

Yan direkler: gerçek veri seti workbench'i (D), içerik altyapısı + telemetri (E), exam modu (F), kredibilite (G).

---

## 2. v1'de Değişmesi Gerekenler (önce ev temizliği)

| Mevcut özellik | Karar | Gerekçe |
|---|---|---|
| `Question.explain` tek metin | **Genişlet** → `explain` + `optionExplanations: Record<optionIndex, string>` + opsiyonel `worked: string` (uzun çözüm) | En düşük efor, en yüksek pedagojik kazanç. |
| Sabit zamanlayıcı (90/60/45/35s) | **Esnetilmiş**: timer "challenge mode" opsiyonu olur, varsayılan kapalı | Zaman baskısı öğrenmeyi zorlaştırır; assessment'ta ayrı tutulmalı. |
| Random soru çekme (`pull qPerRun random`) | **Değiştir** → adaptif seçici (öğrenenin zayıf method'larından öncelik) | Random "fair" değil; öğrenmeyi rastlantıya bırakıyor. |
| Diagnostic tek seferlik | **Yenilenebilir** → branch bazlı re-diagnostic, periyodik | Mastery değişiyor; profil de değişmeli. |
| `caseInProgress` localStorage | **Backend-first** signed-in users | Cihazdan cihaza devamlılık temel beklenti. |
| `events` (admin only) | **Birinci sınıf telemetri tablosuna terfi** (`question_attempts`) | Kalibrasyonun olmazsa olmazı. |
| Free tier: ilk 20 case | **Yeniden çerçeve**: "Free = first branch tam + diğerlerinden 2 case" | Şu anki kesim öğrenciyi ilk yan branch'larda durduruyor. |
| `App.tsx` 7.700 satır | **Refactor zorunlu**: gerçek route'lar (react-router veya tanstack-router) + view-per-file | Yeni özellikler için scalability borcu. |
| Streak (daily + review) | **Tut, görünürlüğü kıs** | Faydalı ama dashboard'u domine ediyor; mastery'i gölgeliyor. |

**Çıkarılacaklar**:
- `dailyStreakBest` ayrı görünüm — sadece dashboard veri ucu olarak kalsın, ana ekrandan kaldırın.
- "XP" — ya gerçek bir manaya bağla (mastery proxy) ya kaldır. Şu hâliyle dekoratif.
- Confetti — kalsın ama her perfect run'da değil, anlamlı milestone'larda (branch tamamlama, ilk mastered method).

---

## 3. Yeni özellikler — tam spesifikasyonlar

Her özellik şu formatta: **Sorun → Hedef → Nasıl → Değer → Karmaşıklık / Öncelik / MVP / Backend / UI / Risk / Test**.

### F1. Distractor-aware Misconception Feedback

- **Sorun**: Tüm yanlışlara aynı `.explain`. En yaygın yanlış kavramlar (örn. "p-value = effect büyüklüğü") yakalanamıyor.
- **Hedef kullanıcı**: Tüm öğrenenler.
- **Nasıl çalışır**: Her MCQ option'ına opsiyonel `why_wrong` metni. Reveal sonrası sadece öğrenenin seçtiği distractor için açıklama parlatılır + "Bu yaygın bir yanılgı" rozet. Multi-select için yanlış işaretlenen + atlanan doğrular ayrı listelenir.
- **Değer**: Pedagojik en yüksek-ROI dokunuş; öğretmenin kişisel geri bildirimine en yakın deneyim.
- **Karmaşıklık**: **Düşük** (data + UI değişimi).
- **Öncelik**: **Must-have**.
- **MVP**: v2.0 (Faz 1).
- **Backend**: yok (data field).
- **UI**: CasePlay reveal panel + DeepDive bağlantısı.
- **Risk**: 1.000+ soru için içerik üretim yükü — başlangıçta "top method'ların top distractor'ları" (Pareto) kapsamla başla.
- **Test**: `cases.test.ts`'e zorunluluk değil; eklendiğinde tüm option indeks'lerin geçerli olduğu schema testi. UI snapshot + a11y.

### F2. Per-attempt Telemetry & IRT Calibration

- **Sorun**: Soru güçlüğü developer hissinden geliyor; ayırt edicilik bilinmiyor.
- **Hedef**: Platform (içerik kalitesi), instructors (item analysis), öğrenciler dolaylı.
- **Nasıl**: Yeni `question_attempts` tablosu (user_id, qid, chosen_option, correct, ms_to_answer, hint_used, deep_dive_opened, run_id, created_at). Aylık batch IRT (2PL) → her soru için `b` (difficulty) + `a` (discrimination) skorları. Düşük discrimination (`a < 0.5`) sorular "needs review" kuyruğuna girer. Adaptive engine `b` skorunu kullanır.
- **Değer**: Tüm adaptive davranışın temeli. Ayrıca instructor item analysis'i.
- **Karmaşıklık**: **Yüksek** (telemetry pipeline + offline IRT job + admin UI).
- **Öncelik**: **Must-have** (F4 ve F8 buna bağlı).
- **MVP**: v2.0 (Faz 1, A1 olmadan F4 yapılamaz).
- **Backend**: yeni Postgres tablosu + RLS + Vercel cron'da IRT job (Python service küçük, Pyodide veya ayrı serverless function).
- **UI**: yok (faz 1); admin item-analysis dashboard faz 2.
- **Risk**: Soğuk başlangıç problemi — ilk 50-100 attempt biriktirene kadar `a, b` güvenilir değil. Önlem: prior olarak instructor-tahminli güçlük + Bayesian güncelleme.
- **Test**: attempt insert idempotent, RLS testleri (kullanıcı başkasının attempt'ini göremez), IRT job kontrat testi (sample data → bilinen `b` aralığı).

### F3. Layered Hint System

- **Sorun**: Sıkışan öğrenci ya tahmin yapıyor ya pes ediyor. Hint yok.
- **Hedef**: Junior öğrenenler (intern/resident).
- **Nasıl**: Üç katmanlı hint:
  1. **Sezgisel ipucu** ("hangi method?")
  2. **Yapısal ipucu** ("formülün hangi bileşeni anahtar?")
  3. **Yarı-çözüm** ("şu adıma kadar yap, sonrası senin")
  Her hint puan kırpıyor (ama hâlâ kredi var). Hint kullanımı telemetriye yazılıyor (F2 sinyali).
- **Değer**: "Hiçbir şey yapamadım" tecrübesini "yardımla başardım"a çeviriyor. Davranışsal sebatkârlığı artırır.
- **Karmaşıklık**: **Orta** (data + UI + scoring + telemetry).
- **Öncelik**: **Should-have**.
- **MVP**: v2.1 (F1 + F2'den sonra).
- **Backend**: hint kullanımı `question_attempts` içine.
- **UI**: CasePlay'de "Hint" düğmesi, soldan açılır panel.
- **Risk**: hint yazımı işçi-yoğun. Önlem: ilk turda yalnızca `method` taşıyan sorulara şablonlu Layer 1 (otomatik); Layer 2/3 yazarlık ekibinden gelir.
- **Test**: hint açıldığında skor doğru kırpılıyor mu, telemetriye yazılıyor mu.

### F4. Adaptive Within-Case Item Selection

- **Sorun**: Random çekim öğrenme verimini düşürüyor; öğrenci bildiklerini tekrar görüyor, bilmediklerini hiç görmüyor olabiliyor.
- **Hedef**: Tüm öğrenenler.
- **Nasıl**: Her case run'ı için bank'tan çekim, öğrenenin **method-bazlı mastery skoru** (Bayesian update veya basit logistic) ve **soru güçlüğü** (`b`) baz alınarak yapılıyor. Hedef: %60–75 başarı koridoru (zone of proximal development). Yanlış sonra bir sonraki soru aynı method'tan ama daha kolay. Doğru sonra bir basamak yukarı.
- **Değer**: Aynı bank, çok daha yüksek öğrenme yoğunluğu.
- **Karmaşıklık**: **Orta** (selector logic + mastery state). F2'ye bağlı.
- **Öncelik**: **Must-have**.
- **MVP**: v2.1.
- **Backend**: `user_method_mastery` tablosu (user_id, method, theta, n_obs, last_updated).
- **UI**: yok (sessiz davranır); opsiyonel "neden bu soru?" tooltip.
- **Risk**: Başlangıçta cold-start; çözüm: diagnostic profilini başlangıç prior'u olarak kullan.
- **Test**: selector birim testi (verilen mastery + bank → seçilen soru aralığı), %başarı koridoru simülasyon testi.

### F5. Real-Data Workbench (R/Python in-browser)

- **Sorun**: Soruların verisi metnin içinde gömülü. Öğrenci hiçbir zaman gerçek veriye dokunmuyor.
- **Hedef**: Resident+ seviye, lisansüstü öğrenci, instructor.
- **Nasıl**: Seçili case'ler "lab" varyantı kazanır. WebR (R browser'da) veya Pyodide ile read-only kod editörü + önceden yüklenmiş küçük dataset (NHANES alt kümesi, COVID open data, MIMIC subset, kütüphane curated 5–10 dataset). Görev: "modeli kur, çıktıyı oku, soruyu cevapla". Soru, çıktıdan elde edilen değeri ister (numeric Q'lar buraya bağlanır).
- **Değer**: Konseptten pratiğe köprü. Bu BioStatQuest'i diğer tüm web quiz'lerinden ayırır.
- **Karmaşıklık**: **Yüksek** (WebR/Pyodide bundle, sandbox, dataset hosting, CSP).
- **Öncelik**: **Should-have** (faz 2 farklılaşma).
- **MVP**: v2.2.
- **Backend**: dataset CDN; çalıştırma client-side.
- **UI**: split-pane editor + console + soru paneli.
- **Risk**: WebR ~25MB, ilk yükleme acılı; Pyodide ~10MB. Lazy-load + kullanıcı opt-in. Browser uyumluluğu (Safari mobil sorunlu olabilir).
- **Test**: belirli bir input için `lm(...)` katsayılarının deterministik döndüğü smoke test (WebR runtime entegrasyon testi).

### F6. Manuscript-Style Methods/Results Writing Exercises

- **Sorun**: Öğrenciler test çözebiliyor ama bir makaleye "Methods" yazamıyor.
- **Hedef**: Lisansüstü, klinik araştırmacı, fellow/PI.
- **Nasıl**: Yeni question type: `"writing"`. Senaryoda bir analiz tarif edilir; öğrenciden 2-4 cümlelik methods/results paragrafı istenir. Otomatik değerlendirme: rubric tabanlı (anahtar terimler, gerekli unsurlar — örn. "denek sayısı, model tipi, yazılım, p-değer raporlama") + LLM asistanlı yumuşak değerlendirme + örnek altın yanıt yan yana.
- **Değer**: Akademik üstünlük dokunuşu; klinik araştırmacı için en aranan beceri.
- **Karmaşıklık**: **Yüksek** (rubric, LLM gateway, instructor inceleme akışı).
- **Öncelik**: **Should-have**.
- **MVP**: v2.3.
- **Backend**: AI Gateway (Vercel AI Gateway → Claude/GPT) sunucu tarafı çağırır; öğrenci yanıtı + skor `writing_attempts` tablosuna.
- **UI**: rich text yerine sade textarea + canlı kelime sayacı + "rubric'i göster" toggle.
- **Risk**: LLM tutarsızlığı + maliyet. Önlem: rubric tabanlı katı kontrol önce, LLM yumuşak ikincil; instructor mod'da LLM cevaplarını gözden geçirme.
- **Test**: rubric matching deterministik birim testleri; LLM call mock'lu kontrat testleri; istem injection sanitization.

### F7. Interactive Output Interpretation

- **Sorun**: Statik R çıktısı. "CI'ı %95 yerine %99 olsa ne olur?" diye merak eden öğrenci hiçbir şey yapamıyor.
- **Hedef**: Tüm öğrenenler.
- **Nasıl**: Belirli "anchor" sorularda interaktif widget'lar — slider'lar (alpha, n, effect size), gerçek zamanlı recomputation. Plot tıklama: "varsayım ihlali olan residual'a tıkla", "outlier'ı seç", "QQ plot kuyrukta sapan noktayı işaretle". Bir tür intuition pompası.
- **Değer**: Pasif okumadan aktif kavrama geçiş.
- **Karmaşıklık**: **Orta-Yüksek** (her widget özel; jstat/d3/observable benzeri kütüphane).
- **Öncelik**: **Should-have**.
- **MVP**: v2.2 (F5 ile birlikte).
- **Backend**: yok (pure client).
- **UI**: yeni "interactive" question subtype + widget kütüphanesi.
- **Risk**: Custom widget = bakım borcu. Önlem: 5-7 reusable şablon (CI slider, power kalkülatörü, residual tıklama, QQ noktası seçimi, regression line dragger, ROC threshold slider, Bayes prior slider).
- **Test**: her widget için snapshot + a11y (klavye erişimi).

### F8. Misconception Ledger (per-learner)

- **Sorun**: Öğrenci aynı yanılgıyı 5 kez yapıyor; sistem fark etmiyor.
- **Hedef**: Öğrenenler + instructors.
- **Nasıl**: Distractor'lar `misconception_id` ile etiketlenir (örn. "p_means_effect", "correlation_implies_causation"). Öğrenci aynı etiketi tekrar tekrar düşürdükçe sistem "siz şu yanılgıyı 4 kez tekrarladınız" şeklinde özel "kavramsal anti-virüs" akışı sunar: mini-açıklama + 2 hedefli alıştırma. Öğrenci paneli ve instructor heatmap'i bu etiketleri gösterir.
- **Değer**: Kavram düzeyinde kişisel takip; öğretmen sezgisinin yazılım hâli.
- **Karmaşıklık**: **Orta** (taxonomy + UI).
- **Öncelik**: **Should-have**.
- **MVP**: v2.2.
- **Backend**: `misconceptions` referans tablosu + `attempt.misconception_hits` türev sayaç.
- **UI**: "Misconceptions" sekmesi öğrenci profilinde; instructor view'da cohort heatmap.
- **Risk**: taxonomy ölçek sorunu; başlangıçta 30-40 yaygın yanılgı yeterli.
- **Test**: aynı misconception 3 kez tetiklendiğinde nudge mesajı UI testi; etiket → distractor mapping uniqueness.

### F9. Exam Mode

- **Sorun**: Öğrenciler kendilerini gerçek sınav koşulunda test edemiyor; instructor aynısını öğrencilerine veremiyor.
- **Hedef**: Lisansüstü, board sınavına hazırlananlar, instructor.
- **Nasıl**: "Exam" modu — N soru, sabit süre, adımlar arası geri dönüş yasak (ya da disipline edilmiş "flag for review"), reveal yok, sonunda detaylı rapor + yanlış sorularda öğrenme önerileri. Practice exam (kendi seçimi) + instructor-assigned exam (sınıf bazında).
- **Değer**: Profesyonel hazırlık; SRS'in tamamlayıcısı.
- **Karmaşıklık**: **Orta**.
- **Öncelik**: **Should-have**.
- **MVP**: v2.1.
- **Backend**: `exams`, `exam_attempts` tabloları; instructor için `exam_assignments`.
- **UI**: ayrı view; cleansed minimal UI; PDF export rapor.
- **Risk**: cheating; önlem: random sıra + her öğrenciye farklı subset.
- **Test**: timer kontratı (süre dolduğunda otomatik submit), tamponlanmış cevap sızdırılmıyor (network tab'da `correct` field'ı yok).

### F10. Instructor Gradebook + Item Analysis

- **Sorun**: TeachView cohort heatmap güzel ama bireysel öğrenci progresyonu, soru kalitesi yok.
- **Hedef**: Instructors.
- **Nasıl**:
  - **Gradebook**: öğrenci × case matrisi, mastery yüzdesi, son aktivite, "at risk" rozetli öğrenciler (son 14 gün < threshold).
  - **Item analysis**: her soru için tüm sınıf accuracy, mean time, distractor seçim dağılımı, IRT `a/b` (F2 çıktısı), "remove" / "report" CTA.
  - **Cohort growth curve**: branch bazlı zaman içinde mastery eğrisi.
- **Değer**: Üniversite kursunda BioStatQuest'i savunulabilir kılan en kritik özellik.
- **Karmaşıklık**: **Orta**.
- **Öncelik**: **Must-have** (akademik kanal için).
- **MVP**: v2.1.
- **Backend**: çoğunlukla view'lar; aggregate query optimizasyonu için `mv_class_mastery` materialized view.
- **UI**: TeachView'a 3 yeni sekme.
- **Risk**: privacy — bireysel öğrenci skorları görünüyor; FERPA/GDPR uyumu için instructor terimleri sözleşmesi.
- **Test**: aggregation doğruluğu, RLS (başka sınıfın verisini göremezsin), CSV export idempotent.

### F11. Assignment Scheduler

- **Sorun**: Instructor "1. hafta f1, f2; 2. hafta r1, r2" diyemiyor.
- **Hedef**: Instructors.
- **Nasıl**: Instructor case (veya exam) seçer, due date verir, sınıfa atar. Öğrencinin dashboard'unda "bu hafta yapacakların". Otomatik reminder e-posta (mevcut cron altyapısı).
- **Değer**: Müfredata oturma; "şunu yapın" demenin altyapısı.
- **Karmaşıklık**: **Orta**.
- **Öncelik**: **Must-have**.
- **MVP**: v2.1.
- **Backend**: `assignments`, `assignment_completions` tabloları.
- **UI**: TeachView'da "Assignments" sekmesi; öğrenci için "Class queue" widget'ı.
- **Risk**: time zone (course saat dilimi vs öğrenci); UTC sakla, instructor saat diliminde göster.
- **Test**: due-date geçtiğinde durum doğru; partial completion sayım doğru.

### F12. LTI 1.3 / Canvas Integration

- **Sorun**: Üniversite IT'si "LMS'e bağlanıyor mu?" diye soruyor — cevap "hayır" ise konuşma bitiyor.
- **Hedef**: Kurum, instructor.
- **Nasıl**: LTI Advantage 1.3 launch + Names & Roles + Assignment & Grade Service. Canvas/Blackboard/Moodle/D2L'den deep-link ile case veya exam seç → grade geri push.
- **Değer**: Kurum lisans satışının ön şartı.
- **Karmaşıklık**: **Yüksek**.
- **Öncelik**: **Should-have** (önce 1-2 pilot kurumla manuel hibrit).
- **MVP**: v2.3.
- **Backend**: LTI Tool Provider implementasyonu (Vercel function + JWT/JWKS); yeni `lti_deployments` tablosu.
- **UI**: instructor için "Connect to LMS" akışı; deep-link picker.
- **Risk**: LTI standardı detaylı; kütüphane (ltijs) kullan, sıfırdan yazma. Sertifikasyon süreci yavaş — paralel pilot ile başla.
- **Test**: LTI launch JWT doğrulama, AGS gönderim mock testi, OIDC flow.

### F13. Instructor Question Authoring (private bank)

- **Sorun**: Instructor "kendi sorumu eklemek istiyorum" diyor — kanal yok.
- **Hedef**: Instructors.
- **Nasıl**: Instructor sınıfına özel soru bankası ekler (markdown editör + option/answer/explanation/method picker). Sadece o sınıf görür. İsterse "global'e öner" ile editöryal kuyruğa.
- **Değer**: Kurum bağlılığı + içerik büyümesi.
- **Karmaşıklık**: **Orta-Yüksek**.
- **Öncelik**: **Should-have**.
- **MVP**: v2.3.
- **Backend**: `class_questions`, `question_proposals` tabloları; review workflow.
- **UI**: TeachView'da "Authoring" sekmesi; live preview.
- **Risk**: kalite kontrolü; class-only ile başla, global'e geçişte editör onayı zorunlu.
- **Test**: schema validation parity (data/cases.ts'tekiyle aynı invariant'lar geçer).

### F14. Content Versioning & A/B Pedagogy

- **Sorun**: Content kodda; bir soruyu değiştirdiğin an eski attempt'lerin kalibrasyonu kayboluyor; A/B yok.
- **Hedef**: Platform sahibi (sen), instructor (gelecekte).
- **Nasıl**: Soru içeriğini DB'ye taşı (bootstrap için kod → seed). Her soru `version_id`. Attempt log'una `version_id` yazılır. İki açıklama varyantı tanımlayabil; trafik split; mastery delta'yı ölç.
- **Değer**: İçerik velocity'i 10x; pedagojik iddialar artık denenebilir.
- **Karmaşıklık**: **Yüksek**.
- **Öncelik**: **Must-have** (uzun vadeli sağlık için).
- **MVP**: v2.0 Faz 1 ile başla (telemetry ile birlikte) ama tam migration v2.2.
- **Backend**: `questions`, `question_versions`, `cases`, `case_questions` tabloları; admin CRUD UI.
- **UI**: admin authoring view; learner için fark yok (sessiz).
- **Risk**: migration risk yüksek; çift okuma fazı (kod + DB) ile incremental geçiş.
- **Test**: kod-as-source ile DB-as-source aynı dataset üretiyor mu, snapshot karşılaştırma.

### F15. AI-assisted Explanation & Tutor Chat (sınırlı)

- **Sorun**: Öğrenci "anlayamadım, başka türlü anlat" diyor; cevap yok.
- **Hedef**: Tüm öğrenenler.
- **Nasıl**: **Sadece** reveal sonrası, **sadece** o sorunun bağlamında bir AI sohbet penceresi. Sistem prompt sıkı: yalnızca verili soru + method + glossary + öğrenenin attempt'i bağlamında kalır; başka soruyu çözmez. Vercel AI Gateway üzerinden Claude (varsayılan), provider failover.
- **Değer**: Açıklama derinliği isteyen öğrenci için kişisel asistan.
- **Karmaşıklık**: **Orta**.
- **Öncelik**: **Should-have**.
- **MVP**: v2.2.
- **Backend**: Vercel AI Gateway + sunucu tarafı çağrı; rate-limit per user; transcripts `ai_chats` tablosunda (instructor görür).
- **UI**: reveal panelinin altında "Bu soruyu açıkla" sohbet rozet düğmesi.
- **Risk**: hallucination, prompt injection, maliyet. Önlem: küçük model varsayılan (Haiku/4o-mini), Pro tier'da Opus, system prompt'ta "only answer this question" guardrail + adversarial test.
- **Test**: prompt injection test paketi (en az 20 jailbreak girişimi reddedilmeli), token cap, output filtreleme.

### F16. Competency Map & Credential

- **Sorun**: Öğrenenin "neyi biliyorum" görüntüsü dağınık (case skor + SRS + diagnostic ayrı ayrı).
- **Hedef**: Öğrenenler, CV/akademik kayıt için.
- **Nasıl**: 47 method'a karşılık tek bir competency graph. Her method için "Familiar / Practiced / Proficient / Mastered" 4-aşamalı durum (FSRS + accuracy karışımı). Branch rolled-up. Tüm graph görüntülenebilir, paylaşılabilir, PDF "Statement of Competency" export.
- **Değer**: Öğrenmenin görünür çıktısı; CV maddesine dönüştürülebilir.
- **Karmaşıklık**: **Düşük-Orta**.
- **Öncelik**: **Should-have**.
- **MVP**: v2.1.
- **Backend**: yok yeni tablo (mevcut srs + attempt'ten hesap).
- **UI**: yeni "Competency" view; PDF servisi (mevcut Vercel function).
- **Risk**: "Mastered" eşiği akademik kredibiliteye dokunuyor — ayar konservatif olsun (≥30 attempt + ≥85% son-30-gün + SRS reviewed ≥4).
- **Test**: eşik geçişi deterministik birim testi.

---

## 4. Yapılmaması gerekenler (NOT-TO-BUILD list)

| Özellik | Neden değil |
|---|---|
| Generic gamification (avatars, level ups, daily quests) | Öğrenmeye katkı sıfır; UI gürültüsü ekler. Streak zaten var. |
| Public leaderboards | Stres yaratır, akademik bağlamda kötü görünür, top performans kümeleri kopyalamayı teşvik eder. |
| Native iOS/Android app | PWA + responsive web yeterli; bakım maliyeti çok yüksek. |
| Sosyal/forum tartışma | Q&A kaymaya başlar; instructor moderasyon yükü; Discord/Slack benzeri ekosisteme bağlamak zor. Bunun yerine: instructor sınıf içi yorum (F11'in alt-özelliği). |
| i18n/multiple languages | PMF'den önce yatırım — çok erken. İngilizce akademik standart, başla orada kal. |
| Generic "AI tutor that solves anything" | Akademik kredibiliteyi düşürür (intihal/sınav etiği), maliyet patlar. F15 sınırlı kalmalı. |
| VR/AR "immersive learning" | Pedagojik kanıt yok, distraksiyon. |
| Crypto/NFT credential | Akademik dünya bunu ciddiye almıyor; openbadges yeterli. |
| "Unlimited free" tier expansion | Pro modeli bozuyor. |
| Real-time multiplayer quiz battles | Eğlenceli ama biostat öğrenmeyle ilgisi yok; Kahoot zaten bunu yapıyor. |

---

## 5. Önceliklendirme tablosu

| F# | Özellik | Öncelik | Karmaşıklık | Faz |
|---|---|---|---|---|
| F1 | Distractor misconception feedback | Must | Düşük | 1 |
| F2 | Per-attempt telemetry + IRT | Must | Yüksek | 1 |
| F14 | Content versioning (kısmi: telemetry hookup) | Must | Yüksek | 1 → 3 |
| F10 | Gradebook + item analysis | Must | Orta | 2 |
| F11 | Assignment scheduler | Must | Orta | 2 |
| F4 | Adaptive within-case | Must | Orta | 2 |
| F9 | Exam mode | Should | Orta | 2 |
| F16 | Competency map | Should | Düşük-Orta | 2 |
| F3 | Layered hints | Should | Orta | 2 |
| F5 | R/Python workbench | Should | Yüksek | 3 |
| F7 | Interactive output widgets | Should | Orta-Yüksek | 3 |
| F8 | Misconception ledger | Should | Orta | 3 |
| F15 | AI tutor (sınırlı) | Should | Orta | 3 |
| F6 | Manuscript writing | Should | Yüksek | 4 |
| F12 | LTI 1.3 | Should | Yüksek | 4 |
| F13 | Instructor authoring | Should | Orta-Yüksek | 4 |

---

## 6. Faz roadmap

**Faz 1 — "Ölçen sürüm" (8-10 hafta)**: F1, F2, F14 başlangıç. Çıktı: bir soruya cevap verildiğinde gerçek telemetri akıyor; her soruda distractor başına geri bildirim var; IRT job ayda çalışıyor. Görünür kullanıcı değişimi: distractor feedback. Arka planda: kalibrasyon başlıyor.

**Faz 2 — "Adaptif + akademik kanca" (10-12 hafta)**: F4, F9, F10, F11, F16, F3. Çıktı: instructor gerçekten ödev verir, gradebook görür, item analysis yapar; öğrenci adaptive case oynar, exam çözer, hint kullanır, competency map görür. Bu fazın sonunda BioStatQuest'i bir kursta resmi olarak kullanmak savunulabilir.

**Faz 3 — "Pratik + zekâ" (10-12 hafta)**: F5, F7, F8, F15. R/Python lab; interactive widget'lar; misconception ledger; AI tutor. Bu faz farklılaşmayı kalıcılaştırır — rakipler için kopyalaması zor.

**Faz 4 — "Kurum SKU" (12-16 hafta)**: F6 (writing), F12 (LTI), F13 (authoring). Üniversite lisans satılabilir bir ürüne dönüşür. Pilot 2-3 üniversiteyle başla.

**Paralel sürekli iş**: App.tsx refactor (her fazda payı), telemetry pipeline'ın olgunlaşması, Pro tier yeniden çerçeveleme, Vercel maliyet izleme.

---

## 7. MVP scope (v2.0.0 doğrudan release)

Faz 1 tamamı + Faz 2'den **F4 + F10 + F16** çekirdeği = "v2.0 GA". Bu kombinasyon iki sözü tutar:

1. Öğrenciye: "her cevabın daha iyi geri bildirim alıyor + sistem zorluk seviyesini sana göre ayarlıyor + ne öğrendiğini gösteren bir map var".
2. Eğitmene: "öğrencilerini gerçekten görebiliyorsun".

Faz 2'nin diğer parçaları (F11 assignments, F9 exam, F3 hints) hızlı izleme ile v2.1'de.

---

## 8. Üç yüksek-etkili kullanıcı akışı

**Akış 1 — "Adaptive case" (öğrenci, faz 2)**

1. Resident, `r3` Logistic Regression case'ine giriyor.
2. İlk soruya doğru cevap (orta `b`); selector mastery'sini + güncelliyor.
3. Sonraki soru bir adım üst `b`; bir distractor seçiyor → "p_means_significance" misconception etiketli; reveal'da bu yanlış spesifik açıklamayla parlıyor.
4. "Hint" kullanmıyor; sonraki sorularda system mastery'i tekrar düşürüyor, ama yine zone'da kalan soru sunuyor.
5. Run sonu: 6/8 doğru, ama "p_means_significance" 2 kez tetiklendi → competency map'te `hypothesis_testing` "Practiced"da kalıyor; sistem "Bu kavrama 5 dakikalık mini-modül?" diye soruyor.

**Akış 2 — "Instructor sınıf yönetimi" (faz 2)**

1. Dr. X biostat kursunu açıyor, 35 öğrenci ekliyor (CSV upload veya kod).
2. Hafta 1: f1, f2, f3 case'lerini "soft due Friday" assignment olarak veriyor.
3. Pazartesi günü gradebook'a bakıyor: 4 öğrenci hiç başlamamış (otomatik nudge atıldı), 6 öğrenci `prob_dist`'te < %50 (item analysis: bir soruda %78 distractor B'yi seçmiş — soru kalitesinden mi, gerçek bir misconception mı? Item analysis discrimination düşük gösteriyor → Dr. X sorguyu işaretliyor, replace ediyor).
4. Hafta 2'de aynı misconception sınıf çapında nudged.

**Akış 3 — "Real-data lab" (lisansüstü, faz 3)**

1. Öğrenci `r5` Cox PH case'inde "lab" varyantını seçiyor.
2. WebR yükleniyor (lazy, ilk seferde uyarı), NHANES alt kümesi pre-loaded.
3. Soru: "PH varsayımını test edin ve schoenfeld testinin p değerini girin."
4. Öğrenci `cox.zph(...)` çalıştırıyor; çıktıdan değeri okuyup giriyor.
5. Yanlışsa: AI tutor (F15) "çıktıda hangi sütuna baktınız?" diye soruyor; doğruysa: Deep Dive PH varsayımı pitfall'larıyla açılıyor.

**Akış 4 — "Self-assessment exam" (board hazırlığı, faz 2)**

1. Öğrenci "Practice Exam: Inference & Estimation" seçiyor.
2. 30 soru, 45 dakika, geri dönüş yasak.
3. Bitince rapor: %72 genel, ama `multiple_testing`'de %40, `bayes`'de %30 → 5 önerilen case otomatik queue'ya.
4. PDF rapor indirilebilir (CV ekine değil ama kişisel takip için).

**Akış 5 — "Manuscript yazımı" (klinik araştırmacı, faz 4)**

1. Resident bir RCT senaryosu okuyor.
2. "Yazınızı (Methods, 3-5 cümle) buraya yazın" promptu.
3. Yazıyor. Rubric otomatik kontrol: ✅ analiz tipi belirtilmiş, ✅ p-değer eşiği belirtilmiş, ❌ "intention-to-treat" geçmiyor, ❌ yazılım/version yok.
4. AI yumuşak geri bildirim ekliyor; altın standart yan yana gösteriliyor.

---

## 9. Pedagojik ve istatistiksel kalite önerileri

1. **Her sayısal sorunun runnable provenance'ı olsun**: yanıtı üreten R/Python script repo'da `tests/answer_keys/` altında, CI'da çalışsın, üretilen değer soru `answer` ile eşleşsin. (Mevcut `cases.test.ts` invariant'ını derinleştirir.)
2. **Her method için en az bir referans link olsun**: `reading[]` alanı şu anda düz metin — DOI/URL ekle. Akademik trust için kritik.
3. **Editör kurulu**: 2-3 PhD biyoistatistikçi (kendin + 2 davet) içerik onay zincirine girsin. Her yeni soru veya methods güncellemesi en az 1 ek göz görmeden production'a gitmesin. Bu, F14'ün (content versioning) içine `status: draft | reviewed | published` field olarak girer.
4. **"Pitfalls" derinleştirme**: Şu anki `methods.ts` pitfall'ları 2-3 madde. Her method için en yaygın 5 hata + tipik vaka örneği + nasıl tespit ederim sütunu. Bu, F1 distractor'larının yazılmasında doğrudan kaynak.
5. **Glossary tekilliği**: 1:1 method-to-glossary kuralı (`glossary.test.ts`) iyi ama glossary auto-derive olduğu için yüzeysel kalıyor. Glossary entry'lerini hand-edit edilmiş "plain English" + "common mistake" + "minimum viable example" alanlarıyla zenginleştir; method'tan ayrı yaşasın.
6. **Versiyonlanmış öğretim notları**: Her method için kısa (1-2 sayfa) kavramsal not (markdown). Case + glossary + methods note üçgeni. Şu an methods + glossary var; uzun-form not eksik.
7. **Reproducible answer keys**: Her sayısal yanıtın yanına "this was computed with R 4.4.1, package survival 3.6, seed 42" notu. Akademik tekrarlanabilirlik standartlarına selam.
8. **Bias panel**: Causal/observational case'lerde bir "bias inventory" mini-paneli (selection, information, confounding, immortal time) → her case için hangi bias'lar mevcut, nasıl ele alındı.
9. **Effect size first, p second**: pedagojik tonu sistematik gözden geçir — şu anki içerikte birkaç soru hâlâ p-değer öncelikli çerçevelemede. Modern raporlama (CI + effect size + clinical significance) standartına hizala.
10. **Domain coverage audit**: 47 method good, ama eksikleri haritala: longitudinal mixed models (var, sığ), GEE (yok?), survival competing risks (yüzeysel), causal mediation (var ama zayıf), Bayesian (var ama tek case), measurement invariance, multilevel modeling.

---

## 10. Akademik kredibilite önerileri

Akademik dünyada "ürün" değil, "kurumsal güvenilirlik" satarsın. Şu sıralı yatırımlar:

1. **Citable methodology paper**: BioStatQuest'in pedagojik tasarımı (özellikle adaptive engine + IRT kalibrasyonu + misconception ledger) için bir methods kısa makale (örn. *Statistics in Medicine* veya *BMC Medical Education*). DOI + atıf hakkı verir; üniversite IT'sinin "bu nedir?" sorusuna cevap olur.
2. **Editorial advisory board**: 4-6 isimli akademisyen (farklı kurumlardan) bir advisory board olarak listelensin (LinkedIn-soft commit yeter). Sayfada "Advisors" bölümü.
3. **Open-source content + CC-BY lisans**: Soru içeriği (görsel + asset hariç) açık lisans. Akademisyenler kapalı kutuya güvenmiyor; açıklık güven yaratır.
4. **Item-quality raporu yıllık yayın**: F2'den çıkan IRT kalibrasyonunu yılda bir agregate rapor olarak yayınla (anonim, agregate). "Bizim sorularımızın ortalama discrimination 0.7'dir" diyebilmek satış konuşmasının kazanan cümlesidir.
5. **Validation çalışmaları**: Bir-iki üniversiteyle collaboration → BioStatQuest kullanımı vs kullanmama, bilgi kazancı (pre/post test). Sonucu yayınla. Bu, kurumsal satışın "altın bilet"i.
6. **FERPA / GDPR / HIPAA stance**: Özellikle US üniversite satışı için FERPA-compatible Data Processing Addendum hazır olsun. Privacy.md sayfası, audit log opsiyonu.
7. **Accessibility statement**: Mevcut a11y guardrails'i public bir statement'a dök (WCAG 2.1 AA hedef). ADA dosyalama kaygısı olan kurumların check-box'ı.
8. **PI / faculty pricing**: Bireysel "Pro" yanına "Educator" tier (ücretsiz veya düşük) — küçük/free, yapışkanlık yüksek. Kurum tier ayrı SKU.
9. **Citation generator**: Öğrenci "BioStatQuest competency report"u CV'sine eklerse, doğru atıf formatı sağla (BibTeX + APA).
10. **Misuse policy**: AI tutor varlığı sınav etiği endişesini tetikler; net bir "exam mode'da AI yok" + "akademik dürüstlük" sayfası.

---

## 11. Mimari kararlar (architect notu)

Bu vizyonun tutması için altyapı kararları (tartışmaya açık ama benim tavsiyem):

- **`App.tsx` 7.7K satır → çoklu route + view files**: react-router-dom ekle (zaten dependency'lerde yok), her view kendi dosyasında, App sadece shell + auth context.
- **State yönetimi**: useState ağacı F4/F8/F11 ile şişer — Zustand ekle (küçük, opinionated, ts-friendly). Redux gereksiz.
- **Telemetri pipeline**: Vercel Functions → Supabase insert → günlük materialized view rollup → IRT için Python serverless function (Vercel Python runtime, Fluid Compute) veya basit Node-based simple-statistics + lme4 yerine kendi 2PL implementation.
- **AI çağrıları**: Vercel AI Gateway, provider-agnostic. F15 + F6 oradan geçsin; client'ta API key tutma.
- **Content DB migration**: Çift okuma fazı 2-3 ay; cutover risk düşürmek için.
- **Test piramidi**: Mevcut unit + a11y iyi. **E2E ekle**: Playwright (Vercel native), kritik flows (sign-in, case complete, instructor assignment, exam submit). Şu an entegrasyon testi sıfır.
- **Observability**: Sentry veya Vercel built-in hata izleme + custom telemetri dashboard'u (instructor + admin).
- **Performans bütçesi**: SkillTree + Glossary lazy-load iyi başlangıç; CasePlay route-split yapılmalı; WebR (F5) ayrı chunk + on-demand.
- **Cost guardrails**: AI tutor + Workbench → per-user cap (örn. günde 20 mesaj, ayda 30 lab session) + Pro tier ile genişlet.

---

## 12. Risk Reg

| Risk | Olasılık | Etki | Önlem |
|---|---|---|---|
| IRT kalibrasyonu yetersiz veriyle yanılıyor | Yüksek | Orta | Bayesian prior + min N (≥50) eşiği; o zamana kadar instructor-tahminli `b`. |
| AI tutor halüsinasyon → akademik skandal | Düşük-Orta | Yüksek | Sıkı system prompt + adversarial test paketi + transcript log + instructor görünürlük. |
| F14 content migration veri kaybı | Düşük | Yüksek | Kod = source of truth fazı 3 ay; çift okuma; her release öncesi snapshot diff CI. |
| LTI sertifikasyonu yavaş → kurum satış geç | Orta | Orta | Pilotla manuel başla; ltijs lib + 1 üniversite ile prod-pilot 3 ay. |
| WebR/Pyodide bundle Safari mobil patlat | Orta | Düşük-Orta | Feature detection + "lab modu desktop önerilir" notu. |
| F1 distractor explanation içerik üretim borcu | Yüksek | Düşük | Pareto: en çok cevaplanan ilk 100 soru; gerisi rolling. |
| Privacy/FERPA detayı kaçırma | Düşük-Orta | Yüksek | Faz 4 öncesi hukuki review; DPA template hazır. |
| Pro tier kannibalizasyonu free expansion ile | Orta | Orta | Free tier rebalance dikkatli; analytics konversiyon takip. |

---

## 13. Başarı metrikleri (v2.0 GA → 6 ay)

- **Pedagojik**: Ortalama soru discrimination ≥ 0.5; misconception "tekrar etme" oranı (aynı etiket 2.+ kez) %30+ azalma.
- **Engagement**: 7-day retention v1 baseline'dan +%20; ortalama haftalık aktif gün.
- **Akademik**: ≥3 üniversite pilot; ≥1 yayınlanmış validation çalışması taslakta.
- **İçerik velocity**: Yeni soru ekleme median time-to-prod < 1 gün (kod-deploy yerine DB).
- **Konversiyon**: Diagnostic → 1. case oranı; 1. case → Pro deneme; Pro deneme → satın.
- **Instructor**: Sınıf oluşturan instructor'ların %50+'sı assignment veriyor; %30+'sı item analysis kullanıyor.

---

## 14. Sonuç

v1 sağlam bir temel: 50 case, 1.000+ soru, FSRS, instructor view, design system, a11y guardrails, telemetri-ready Supabase backend hepsi yerinde. Eksik olan **ölçüm + adaptasyon + akademik kanca** üçlüsü. Bu plan o üç eksiği sırasıyla kapatır:

- Faz 1 ölçer (telemetry + IRT + distractor feedback + content versioning hookup).
- Faz 2 adapte eder + akademiye ilk eli uzatır (adaptive engine, gradebook, assignments, exam, competency map, hints).
- Faz 3 farklılaştırır (R/Python lab, interactive widgets, misconception ledger, sınırlı AI tutor).
- Faz 4 kuruma satar (writing, LTI, instructor authoring).

Yapmadıklarımız listesi en az yaptıklarımız kadar önemli: gamification gürültüsü, generic AI tutor, native app, social/forum gibi kalemler v2.0'da kasıtlı olarak yok.

---

## 15. Tier strategy (Free / Pro / Educator / Institution)

Mevcut "Pro = ilk 20 case'in ötesi" modeli zayıf — Pro'yu **kapsam paywall**'undan **derinlik paywall**'una taşımak gerekiyor. v2.0 özellikleri bu lensten yeniden değerlendirildi.

### 15.1 Üç prensip

1. **Free crippled olmamalı**. Pedagojik temel kaliteyi (adaptiflik, distractor geri bildirim, kalibrasyon, kavram haritası) Pro'ya kilitlersen mesaj şu olur: "ücretsiz versiyonu kötüleştirdik ki ödeyesin". Akademik kullanıcı bunu hisseder ve güvenmez. Free, savunulabilir bir öğrenme aracı olmalı; Pro o aracı **yoğunlaştırır**.
2. **Pro, ölçeklenen değerle satılmalı**. "Daha fazla case" yetmez. Pro'nun karşılığı: (a) gerçek pratik derinliği (lab, AI tutor, exam, full hint), (b) kişisel zekâ (tam misconception ledger, ileri analitik, uzun geçmiş), (c) somut çıktı (PDF sertifika, manuscript feedback, atıf).
3. **Eğitmen/Kurum, kişisel Pro'dan ayrı SKU**. Gradebook, assignment, LTI, authoring — bireysel Pro kullanıcısının ödemediği bir kurumsal değer. Bunları kişisel Pro'ya bindirmek hem fiyatlandırmayı bozar hem yanlış mesajdır.

### 15.2 Önerilen üç katman

| Katman | Kim | Ana vaat | Fiyat hissi |
|---|---|---|---|
| **Free** | Lisans öğrencisi, meraklı, demolayan | "Adaptif öğrenmenin temellerini gerçekten alırsın" | $0 |
| **Pro** (bireysel) | Resident, lisansüstü, board hazırlığı, klinik araştırmacı | "Profesyonel öğrenme stüdyosu: lab, AI yardımı, sınav, sertifika" | aylık abonelik |
| **Educator + Institution** | Öğretim üyesi, kurs koordinatörü, üniversite | "Sınıfımı yönetebilir + LMS'ime bağlayabilirim" | seat/sınıf bazlı veya kurum lisansı |

### 15.3 F1–F16 yeniden sınıflandırma

| F# | Özellik | Yer | Gerekçe |
|---|---|---|---|
| F1 | Distractor misconception feedback | **Free (tam)** | İçerik kalitesi. Pro'ya kilitlemek = free'yi kasıtlı sığlaştırmak. Akademik kredibiliteye zarar. |
| F2 | Telemetry + IRT kalibrasyonu | **Free (görünmez altyapı)** | Herkesin attempt'i kalibrasyonu besliyor; herkesin sorusu kalibre oluyor. |
| F3 | Layered hints | **Hybrid**: Layer 1 (sezgisel) free, Layer 2-3 (yapısal + yarı çözüm) Pro | Free de yardım alır ama "öğretmen-yoğun" hint Pro değeri. |
| F4 | Adaptive within-case | **Free (tam)** | Aynı F1 mantığı: motorun kendisi temel. Free kullanıcıyı random soruyla cezalandırmak yanlış mesaj. |
| F5 | R/Python workbench | **Pro** | Gerçek altyapı maliyeti (WebR ~25MB, dataset bandwidth, opsiyonel sandbox compute). Premium pratik vaadinin omurgası. |
| F6 | Manuscript writing | **Pro** (rubric kontrolü free-light gösterilebilir) | LLM maliyeti per attempt; derin akademik beceri. |
| F7 | Interactive output widgets | **Free (3-4 anchor widget) + Pro (tüm kütüphane + her soruda)** | "Demo" widget'ları free'de kalmalı; kapsam Pro'da büyür. |
| F8 | Misconception ledger | **Hybrid**: top 3 misconception ve genel sayım free; tüm geçmiş + per-misconception mini-modül + zaman serisi Pro | Görünürlük free, derin müdahale Pro. |
| F9 | Exam mode | **Hybrid**: 2 practice exam/ay free + temel rapor; sınırsız + custom subset + PDF export + history Pro | Tatma free, ciddi hazırlık Pro. |
| F10 | Gradebook + item analysis | **Educator** | Bireysel Pro kullanıcısı için anlamsız. |
| F11 | Assignment scheduler | **Educator** | Aynı. |
| F12 | LTI 1.3 | **Institution** | Kurum lisansı. |
| F13 | Instructor authoring | **Educator** | Aynı. |
| F14 | Content versioning | **Free (görünmez altyapı)** | Herkesin lehine. |
| F15 | AI tutor | **Pro** (free'de haftalık 3-5 turn quota) | LLM maliyeti gerçek; ama tam kilitlemek "demolayamadım" tepkisi. |
| F16 | Competency map | **Hybrid**: ekran içi map ve durum free; **imzalı PDF "Statement of Competency" + atıf + uzun geçmiş + branch detayları** Pro | Sertifika çıktısı net Pro değeri. |

**Mevcut "ilk 20 case free" gating yeniden çerçevelenir**: Free = her branch'tan ilk 3 case (= 24 case, mevcut 20'den fazla). Pro = tam catalog + lab varyantları + future cases day-one. Mantık: foundation branch'ı kilitlemek değil, **derinliği** kilitlemek.

### 15.4 Free tier'ın "olmazsa olmazları"

Eğer aşağıdakilerden biri free'de **yoksa**, free tier akademik olarak savunulamaz:

- Tüm question types (mcq, multi, numeric)
- Distractor-aware misconception feedback (F1)
- Adaptive within-case selection (F4)
- Diagnostic + study path
- FSRS Daily Review
- Layer 1 hint (F3)
- Basic competency map (F16'nın ekran kısmı)
- Top-3 misconception görünürlüğü (F8 light)
- Streak + temel progres
- 2 practice exam/ay (F9 light)
- AI tutor — haftalık 3-5 mesaj quota (F15 demo)
- Glossary tam
- Her branch'tan ilk 3 case
- Cross-device sync (signed-in)

### 15.5 Pro tier'ın "değer kanıtları"

Pro kullanıcısı abonelik bedeli karşılığında şu somut farkı yaşamalı:

1. **Pratik laboratuvar** (F5) — gerçek dataset, gerçek R/Python. Pro'nun belkemiği.
2. **Sınırsız AI tutor** (F15)
3. **Sınırsız + özelleştirilebilir exam** (F9) + PDF rapor
4. **Manuscript writing feedback** (F6)
5. **Tam interactive widget kütüphanesi** (F7)
6. **Tam misconception ledger** (F8) — zaman serisi + hedefli mini-modüller
7. **Statement of Competency PDF** (F16 Pro)
8. **Tam catalog** + lab varyantları + day-one access yeni içerik
9. **Layer 2-3 hints** (F3)
10. **Uzun geçmiş + analitik**

İdeal Pro pazarlama mesajı: *"Free seni öğretir; Pro seni profesyonel hâle getirir."*

### 15.6 Educator + Institution

**Educator** (per-class veya per-seat; ≤10 öğrenci instructor için free deneme önerilir):
- F10 Gradebook + item analysis
- F11 Assignment scheduler
- F13 Instructor authoring (sınıfa özel bank)
- AI tutor transcript görünürlüğü
- Class-level misconception heatmap
- CSV roster + temel reporting

**Institution** (yıllık kontrat):
- F12 LTI 1.3 / Canvas / Blackboard / Moodle
- SSO (SAML/Okta)
- DPA + FERPA/GDPR uyumu
- Custom domain / branding
- Validation çalışması ortaklığı

### 15.7 Mevcut free kullanıcılara geçiş (migration policy)

Tier modeli değişirken kritik kural: **kimse mevcuttan daha kötü duruma düşmemeli**. Aksi takdirde "bait and switch" algısı kalıcı güven kaybı yaratır.

Politika:
1. **Hiçbir mevcut free özellik Pro'ya taşınmıyor**. Yeni tier sınıflaması yalnızca **yeni** özellikleri konumlandırıyor (F1–F16). Mevcut free kullanıcı tüm v1 deneyimini aynen sürdürüyor.
2. **Case erişimi kesinlikle daralmıyor**: yeni "her branch'tan 3 case" modeli 24 case'lik free zemin sunar (mevcut 20'den fazla). Hiçbir kullanıcının erişimini kaybetmemesi için ek olarak **grandfathering**: bir kullanıcı v1'de daha önce başlamış / tamamlamış bir case'e her zaman erişimi sürdürür, yeni model onu Pro işaretlese bile.
3. **Yeni free özellikler tamamen kazanç**: F1 (distractor feedback), F4 (adaptive), F2 (kalibrasyon), F16 light (competency map), F8 light, F3 Layer 1, F9 light, F15 quota — hepsi mevcut free kullanıcı için ek değer.
4. **Şeffaf changelog ve duyuru**: "Free şimdi şunları içeriyor: ... — case erişimi yeniden dağıtıldı, mevcut ilerlemeniz korundu."
5. **Pro denemesi**: mevcut free kullanıcılarına 14-30 gün Pro deneme hediye et. Yeni Pro değerini somut yaşatır; konversiyon hunisi besler.
6. **Hiçbir mevcut Pro abonesi de etkilenmiyor**: tam catalog erişimi devam eder, üstüne yeni Pro özellikleri eklenir (lab, AI tutor, exam, sertifika...). Net kazanç.
7. **İçerik ve kalibrasyon her iki tier için iyileşiyor** — telemetri free attempt'leri de kapsadığı için sorular zamanla herkes için keskinleşir.

**Tek hassas nokta**: AI tutor ve exam'in mevcut state'i v1'de yok; v2.0'da getirilirken free'ye quota'lı versiyon **hiç olmamış olarak bırakılırsa** kullanıcı bir şey kaybetmiyor; ama Pro pazarlamasını kuvvetlendirmek için "free de tatma alıyor" pozisyonu daha sağlıklı. Tavsiye: quota'lı hâli free'de mutlaka ver, Pro upgrade davetini context-aware (quota dolduğunda) sun.

### 15.8 Tier anti-pattern uyarıları

- ❌ **Adaptive motoru Pro'ya koyma**. Free random soru çekiyorsa "free pedagojik olarak kötü" demek olur.
- ❌ **Distractor feedback'i sayım kapsa**. Free'de "ay 5 yanlış cevaba spesifik açıklama" gibi quota = kalite sinyalini bozar.
- ❌ **Sertifika para karşılığı satma** (sadece). Sertifika asgari objektif eşiği geçenlere verilebilir; Pro'nun farkı PDF imza, atıf formatı, paylaşım URL'si ve uzun-form analitik raporu olmalı.
- ❌ **AI tutor'u tamamen kilitleme**. Quota ile tatma şart; aksi hâlde dönüşüm hunisi tıkanır.
- ❌ **Eski case'leri Pro'da tutup yeni case'leri free'ye atma** (ya da tersi). Tutarsız erişim modeli kullanıcıyı kaybeder.
- ❌ **Pro'ya "öğrenme dışı" dekoratif şeyler koyma** (avatar, theme, badge boost). Akademik kullanıcı bunlara para vermez, kredibiliteyi düşürür.

**Tek cümlelik özet**: Pro'yu *daha fazla içerik* olarak değil, **"profesyonel öğrenme stüdyosu"** olarak konumlandır: lab + AI yardım + sınırsız sınav + sertifika + tam analitik. Free'yi "zayıf demo" değil, **"saygın bir başlangıç noktası"** olarak tut. Eğitmen ve kurum, ayrı dünyalar.
