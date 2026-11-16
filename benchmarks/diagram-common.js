/* tools.petrov.re — shared tool runtime (framework v2).
   Single global: window.Diagram. No build step, no external dependencies, no network.
   Inert until a tool calls Diagram.init(). Never throws into tool code. */
(()=>{
"use strict";
if(window.Diagram)return;
const VERSION="2026-09-04.v3.7.3-pl";
const LANGS=["en","uk","de","nl","fr","es","pl"];
/* Not "the site": the last resort for a document that has no address at all
   (§ site resolver, below). Every address this runtime prints is derived from
   where the document actually lives, so a copy served from another host cites
   that host. The schema namespaces on the next two lines are the opposite kind
   of string — contract identifiers, never addresses — and never move. */
const SITE_FALLBACK="https://tools.petrov.re/";
const RECORD_SCHEMA="tools.petrov.re/calculation-record/v1";
const HANDOFF_SCHEMA="tools.petrov.re/handoff/v1";
/* §1.5 canonical quantity vocabulary — extend only here and in FRAMEWORK_V2_SPEC.md */
const QTY=["T","p","rho","h","s","u","v","x","w","mdot","Vdot","Q","U","A","NTU","eps","f_darcy","Re","D","L","dp","M","phi","rho_reac","E","I","V_volt","Z","XR","Ik","ip","Ib","Ith","Ires","t_clear"];
/* units that are never acceptable in a handoff payload (§1.5: SI base units only) */
const BADUNIT=/^(k|m|c|d|h|da|M|G|µ|u|n)?(Pa|W|J\/kg|g|bar|barg|psi|atm|Torr|°C|degC|C|°F|F|kWh|Wh|L\/s|l\/s|m3\/h|cfm|rpm|%)$/;
const OKUNIT=["K","Pa","kg/s","m3/s","J/kg","J/(kg.K)","J/(kg·K)","W","kg/m3","m","s","kg/kg","m3/kg","V","A","Ohm","Ω","W/(m2.K)","W/(m2·K)","m2","-",""];
/* Canonical quantity -> allowed SI handoff unit(s).  This prevents a payload from
   using a syntactically allowed but dimensionally wrong unit, e.g. Ik in V. */
const QUNIT={
 T:["K"],p:["Pa"],rho:["kg/m3"],h:["J/kg"],s:["J/(kg.K)","J/(kg·K)"],u:["J/kg"],v:["m3/kg"],
 x:["-",""],w:["kg/kg"],mdot:["kg/s"],Vdot:["m3/s"],Q:["W"],U:["W"],A:["m2"],NTU:["-",""],
 eps:["-",""],f_darcy:["-",""],Re:["-",""],D:["m"],L:["m"],dp:["Pa"],M:["-",""],phi:["-",""],
 rho_reac:["-",""],E:["J/kg"],I:["A"],V_volt:["V"],Z:["Ohm","Ω"],XR:["-",""],
 Ik:["A"],ip:["A"],Ib:["A"],Ith:["A"],Ires:["A"],t_clear:["s"]
};

const T={
 tools:{en:"Tools",uk:"Інструменти",de:"Werkzeuge",nl:"Hulpmiddelen",fr:"Outils",es:"Herramientas",pl:"Narzędzia"},
 bar:{en:"Record & export",uk:"Запис і експорт",de:"Protokoll & Export",nl:"Vastleggen & export",fr:"Relevé et export",es:"Registro y exportación",pl:"Zapis i eksport"},
 copyLink:{en:"Copy link",uk:"Копіювати посилання",de:"Link kopieren",nl:"Link kopiëren",fr:"Copier le lien",es:"Copiar enlace",pl:"Kopiuj link"},
 linkCopied:{en:"Permalink copied to the clipboard.",uk:"Постійне посилання скопійовано.",de:"Permalink in die Zwischenablage kopiert.",nl:"Permalink naar het klembord gekopieerd.",fr:"Lien permanent copié dans le presse-papiers.",es:"Enlace permanente copiado al portapapeles.",pl:"Link stały skopiowany do schowka."},
 linkHere:{en:"Copy this link:",uk:"Скопіюйте це посилання:",de:"Diesen Link kopieren:",nl:"Kopieer deze link:",fr:"Copiez ce lien :",es:"Copie este enlace:",pl:"Skopiuj ten link:"},
 linkLong:{en:"This state link is about %n kB. Some mail and chat clients truncate links above ~4 kB — send the JSON record instead if it does not open.",uk:"Це посилання займає близько %n кБ. Деякі поштові та месенджер-клієнти обрізають посилання понад ~4 кБ — тоді надішліть запис JSON.",de:"Dieser Zustands-Link ist etwa %n kB groß. Manche Mail- und Chat-Programme kürzen Links über ~4 kB — senden Sie dann stattdessen den JSON-Datensatz.",nl:"Deze toestandslink is ongeveer %n kB. Sommige mail- en chatprogramma's korten links boven ~4 kB in — stuur dan het JSON-record.",fr:"Ce lien d'état fait environ %n kB. Certains clients de messagerie tronquent les liens au-delà de ~4 kB — envoyez alors l'enregistrement JSON.",es:"Este enlace de estado ocupa unos %n kB. Algunos clientes de correo y chat truncan enlaces de más de ~4 kB — envíe entonces el registro JSON.",pl:"Ten link stanu ma około %n kB. Niektóre klienty poczty i czatu obcinają linki powyżej ~4 kB — w przypadku braku otwarcia wyślij zamiast tego rekord JSON."},
 report:{en:"PDF report",uk:"Звіт PDF",de:"PDF-Bericht",nl:"PDF-rapport",fr:"Rapport PDF",es:"Informe PDF",pl:"Raport PDF"},
 json:{en:"JSON record",uk:"Запис JSON",de:"JSON-Datensatz",nl:"JSON-record",fr:"Enregistrement JSON",es:"Registro JSON",pl:"Rekord JSON"},
 csv:{en:"CSV",uk:"CSV",de:"CSV",nl:"CSV",fr:"CSV",es:"CSV",pl:"CSV"},
 py:{en:"Python",uk:"Python",de:"Python",nl:"Python",fr:"Python",es:"Python",pl:"Python"},
 sendTo:{en:"Send to…",uk:"Надіслати до…",de:"Senden an…",nl:"Sturen naar…",fr:"Envoyer vers…",es:"Enviar a…",pl:"Wyślij do…"},
 noTargets:{en:"No other tool accepts these quantities.",uk:"Жоден інший інструмент не приймає ці величини.",de:"Kein anderes Werkzeug nimmt diese Größen an.",nl:"Geen andere tool accepteert deze grootheden.",fr:"Aucun autre outil n'accepte ces grandeurs.",es:"Ninguna otra herramienta acepta estas magnitudes.",pl:"Żadne inne narzędzie nie przyjmuje tych wielkości."},
 noRecord:{en:"There is no calculation to export yet. Compute a result first.",uk:"Ще немає розрахунку для експорту. Спочатку обчисліть результат.",de:"Es liegt noch keine Berechnung zum Export vor. Bitte zuerst rechnen.",nl:"Er is nog geen berekening om te exporteren. Reken eerst een resultaat uit.",fr:"Aucun calcul à exporter pour l'instant. Calculez d'abord un résultat.",es:"Todavía no hay ningún cálculo que exportar. Calcule primero un resultado.",pl:"Nie ma jeszcze obliczeń do wyeksportowania. Najpierw oblicz wynik."},
 badLink:{en:"The shared link could not be read: the encoded state is damaged or comes from another version of this tool. The tool was opened with its default state.",uk:"Не вдалося прочитати надіслане посилання: закодований стан пошкоджено або він з іншої версії інструмента. Інструмент відкрито зі станом за замовчуванням.",de:"Der geteilte Link konnte nicht gelesen werden: Der kodierte Zustand ist beschädigt oder stammt aus einer anderen Version. Das Werkzeug wurde mit dem Standardzustand geöffnet.",nl:"De gedeelde link kon niet worden gelezen: de gecodeerde toestand is beschadigd of komt uit een andere versie. De tool is met de standaardtoestand geopend.",fr:"Le lien partagé n'a pas pu être lu : l'état encodé est endommagé ou provient d'une autre version. L'outil a été ouvert avec son état par défaut.",es:"No se pudo leer el enlace compartido: el estado codificado está dañado o procede de otra versión. La herramienta se abrió con su estado predeterminado.",pl:"Udostępnionego linku nie można odczytać: zakodowany stan jest uszkodzony lub pochodzi z innej wersji tego narzędzia. Narzędzie zostało otwarte w stanie domyślnym."},
 pyState:{en:"Python export is not available for the current state: %s",uk:"Експорт у Python недоступний для поточного стану: %s",de:"Python-Export ist für den aktuellen Zustand nicht verfügbar: %s",nl:"Python-export is niet beschikbaar voor de huidige toestand: %s",fr:"L'export Python n'est pas disponible pour l'état actuel : %s",es:"La exportación a Python no está disponible para el estado actual: %s",pl:"Eksport Pythona nie jest dostępny dla bieżącego stanu: %s"},
 hoOffline:{en:"The tool catalogue cannot be read offline, so this list comes from a stored snapshot (%s) and may be out of date.",uk:"Каталог інструментів недоступний офлайн, тому цей перелік узято зі збереженого знімка (%s) і він може бути застарілим.",de:"Der Werkzeugkatalog ist offline nicht lesbar; diese Liste stammt aus einem gespeicherten Abzug (%s) und kann veraltet sein.",nl:"De catalogus is offline niet leesbaar; deze lijst komt uit een opgeslagen momentopname (%s) en kan verouderd zijn.",fr:"Le catalogue des outils n'est pas lisible hors ligne : cette liste provient d'un instantané enregistré (%s) et peut être périmée.",es:"El catálogo no se puede leer sin conexión: esta lista procede de una instantánea guardada (%s) y puede estar desactualizada.",pl:"Katalogu narzędzi nie można odczytać w trybie offline, dlatego lista ta pochodzi z zapisanej migawki (%s) i może być nieaktualna."},
 hoOfflineNone:{en:"Offline: the tool catalogue cannot be read, so receiving tools cannot be listed. The data itself is ready — copy it and open the receiving tool yourself.",uk:"Офлайн: каталог інструментів недоступний, тому перелічити приймачів не можна. Самі дані готові — скопіюйте їх і відкрийте потрібний інструмент вручну.",de:"Offline: Der Werkzeugkatalog ist nicht lesbar, empfangende Werkzeuge können nicht aufgelistet werden. Die Daten selbst sind fertig — kopieren Sie sie und öffnen Sie das Zielwerkzeug selbst.",nl:"Offline: de catalogus is niet leesbaar, dus ontvangende tools kunnen niet worden getoond. De gegevens zelf staan klaar — kopieer ze en open de ontvangende tool zelf.",fr:"Hors ligne : le catalogue n'est pas lisible, les outils destinataires ne peuvent pas être listés. Les données sont prêtes — copiez-les et ouvrez l'outil destinataire vous-même.",es:"Sin conexión: no se puede leer el catálogo, así que no se pueden listar las herramientas receptoras. Los datos están listos — cópielos y abra usted mismo la herramienta receptora.",pl:"Offline: nie można odczytać katalogu narzędzi, więc nie można wyświetlić listy narzędzi odbiorczych. Dane są już gotowe — skopiuj je i samodzielnie otwórz narzędzie odbiorcze."},
 hoCopy:{en:"Copy the handoff data (JSON)",uk:"Копіювати дані передачі (JSON)",de:"Übergabedaten kopieren (JSON)",nl:"Overdrachtsgegevens kopiëren (JSON)",fr:"Copier les données de transfert (JSON)",es:"Copiar los datos de transferencia (JSON)",pl:"Kopiuj dane przekazania (JSON)"},
 hoCopied:{en:"Handoff data copied to the clipboard.",uk:"Дані передачі скопійовано.",de:"Übergabedaten in die Zwischenablage kopiert.",nl:"Overdrachtsgegevens naar het klembord gekopieerd.",fr:"Données de transfert copiées dans le presse-papiers.",es:"Datos de transferencia copiados al portapapeles.",pl:"Dane przekazane zostały skopiowane do schowka."},
 rImgOff:{en:"[figure omitted: only images embedded as data: URLs are printed, the report loads nothing from the network]",uk:"[рисунок пропущено: друкуються лише зображення, вбудовані як data:-URL; звіт нічого не завантажує з мережі]",de:"[Abbildung ausgelassen: gedruckt werden nur als data:-URL eingebettete Bilder; der Bericht lädt nichts aus dem Netz]",nl:"[figuur weggelaten: alleen als data:-URL ingesloten afbeeldingen worden afgedrukt; het rapport laadt niets van het netwerk]",fr:"[figure omise : seules les images intégrées en data: URL sont imprimées, le rapport ne charge rien depuis le réseau]",es:"[figura omitida: solo se imprimen imágenes incrustadas como data: URL; el informe no carga nada de la red]",pl:"[pominięto rysunek: wyświetlane są tylko obrazy osadzone jako dane: drukowane są adresy URL, raport nie ładuje niczego z sieci]"},
 pyOff:{en:"Python export is not available for this tool: %s",uk:"Експорт у Python недоступний для цього інструмента: %s",de:"Python-Export ist für dieses Werkzeug nicht verfügbar: %s",nl:"Python-export is niet beschikbaar voor deze tool: %s",fr:"L'export Python n'est pas disponible pour cet outil : %s",es:"La exportación a Python no está disponible para esta herramienta: %s",pl:"Eksport do języka Python nie jest dostępny dla tego narzędzia: %s"},
 hoBad:{en:"The data handed over by the other tool could not be read (wrong schema or damaged payload).",uk:"Не вдалося прочитати дані, передані іншим інструментом (невірна схема або пошкоджені дані).",de:"Die vom anderen Werkzeug übergebenen Daten konnten nicht gelesen werden (falsches Schema oder beschädigt).",nl:"De door de andere tool overgedragen gegevens konden niet worden gelezen (verkeerd schema of beschadigd).",fr:"Les données transmises par l'autre outil n'ont pas pu être lues (schéma incorrect ou données endommagées).",es:"No se pudieron leer los datos transferidos por la otra herramienta (esquema incorrecto o datos dañados).",pl:"Danych przekazanych przez inne narzędzie nie udało się odczytać (nieprawidłowy schemat lub uszkodzony ładunek)."},
 hoOk:{en:"Received from %f: %s",uk:"Отримано з %f: %s",de:"Von %f übernommen: %s",nl:"Ontvangen van %f: %s",fr:"Reçu de %f : %s",es:"Recibido de %f: %s",pl:"Otrzymano z %f: %s"},
 hoIgnored:{en:"Ignored — this tool does not use them: %s",uk:"Проігноровано — цей інструмент їх не використовує: %s",de:"Ignoriert — dieses Werkzeug verwendet sie nicht: %s",nl:"Genegeerd — deze tool gebruikt ze niet: %s",fr:"Ignoré — cet outil ne les utilise pas : %s",es:"Ignorado — esta herramienta no las usa: %s",pl:"Zignorowano — to narzędzie ich nie używa: %s"},
 hoUnit:{en:"Rejected, not an SI base unit: %s",uk:"Відхилено, не базова одиниця SI: %s",de:"Abgelehnt, keine SI-Basiseinheit: %s",nl:"Geweigerd, geen SI-basiseenheid: %s",fr:"Rejeté, unité non SI de base : %s",es:"Rechazado, no es unidad base del SI: %s",pl:"Odrzucono, nie jest to jednostka podstawowa SI: %s"},
 close:{en:"Dismiss",uk:"Закрити",de:"Schließen",nl:"Sluiten",fr:"Fermer",es:"Cerrar",pl:"Zamknij"},
 /* Printed where a URL would go when the document has no address a reader
    could use — a file:// copy, a blob:, a sandboxed frame. */
 siteLocal:{en:"local copy",uk:"локальна копія",de:"lokale Kopie",nl:"lokale kopie",fr:"copie locale",es:"copia local",pl:"kopia lokalna"},
 /* report */
 rTitle:{en:"Calculation record",uk:"Протокол розрахунку",de:"Berechnungsprotokoll",nl:"Berekeningsrapport",fr:"Relevé de calcul",es:"Registro de cálculo",pl:"Protokół obliczeń"},
 rGen:{en:"Generated",uk:"Створено",de:"Erstellt",nl:"Gegenereerd",fr:"Généré le",es:"Generado",pl:"Wygenerowano"},
 rSource:{en:"Source",uk:"Джерело",de:"Quelle",nl:"Bron",fr:"Source",es:"Fuente",pl:"Źródło"},
 rPerma:{en:"Permalink (reopens this exact state)",uk:"Постійне посилання (відкриває саме цей стан)",de:"Permalink (öffnet genau diesen Zustand)",nl:"Permalink (opent exact deze toestand)",fr:"Lien permanent (rouvre exactement cet état)",es:"Enlace permanente (reabre exactamente este estado)",pl:"Link trwały (ponownie otwiera ten sam stan)"},
 rLimits:{en:"Known model limitations",uk:"Відомі обмеження моделі",de:"Bekannte Modellgrenzen",nl:"Bekende modelbeperkingen",fr:"Limites connues du modèle",es:"Limitaciones conocidas del modelo",pl:"Znane ograniczenia modelu"},
 rInputs:{en:"Inputs",uk:"Вхідні дані",de:"Eingaben",nl:"Invoer",fr:"Données d'entrée",es:"Datos de entrada",pl:"Wejścia"},
 rOutputs:{en:"Results",uk:"Результати",de:"Ergebnisse",nl:"Resultaten",fr:"Résultats",es:"Resultados",pl:"Wyniki"},
 rModel:{en:"Model",uk:"Модель",de:"Modell",nl:"Model",fr:"Modèle",es:"Modelo",pl:"Model"},
 rEq:{en:"Equations",uk:"Рівняння",de:"Gleichungen",nl:"Vergelijkingen",fr:"Équations",es:"Ecuaciones",pl:"Równania"},
 rRanges:{en:"Validity ranges",uk:"Діапазони чинності",de:"Gültigkeitsbereiche",nl:"Geldigheidsbereiken",fr:"Domaines de validité",es:"Rangos de validez",pl:"Zakresy stosowalności"},
 rNotes:{en:"Notes",uk:"Примітки",de:"Anmerkungen",nl:"Opmerkingen",fr:"Remarques",es:"Notas",pl:"Notatki"},
 rWarn:{en:"Warnings",uk:"Попередження",de:"Warnungen",nl:"Waarschuwingen",fr:"Avertissements",es:"Advertencias",pl:"Ostrzeżenia"},
 rBench:{en:"Benchmark",uk:"Бенчмарк",de:"Benchmark",nl:"Benchmark",fr:"Référence de validation",es:"Banco de pruebas",pl:"Benchmark"},
 rCases:{en:"%p of %c cases passed",uk:"пройдено %p з %c випадків",de:"%p von %c Fällen bestanden",nl:"%p van %c gevallen geslaagd",fr:"%p cas réussis sur %c",es:"%p de %c casos superados",pl:"%p z %c przypadków zaliczonych"},
 rTol:{en:"Tolerance",uk:"Допуск",de:"Toleranz",nl:"Tolerantie",fr:"Tolérance",es:"Tolerancia",pl:"Tolerancja"},
 rRef:{en:"Reference",uk:"Еталон",de:"Referenz",nl:"Referentie",fr:"Référence",es:"Referencia",pl:"Odniesienie"},
 rRun:{en:"Run",uk:"Виконано",de:"Ausgeführt",nl:"Uitgevoerd",fr:"Exécuté",es:"Ejecutado",pl:"Wykonanie"},
 rProp:{en:"Quantity",uk:"Величина",de:"Größe",nl:"Grootheid",fr:"Grandeur",es:"Magnitud",pl:"Wielkość"},
 rVal:{en:"Value",uk:"Значення",de:"Wert",nl:"Waarde",fr:"Valeur",es:"Valor",pl:"Wartość"},
 rUnit:{en:"Unit",uk:"Одиниця",de:"Einheit",nl:"Eenheid",fr:"Unité",es:"Unidad",pl:"Jednostka"},
 rIndep:{en:"independent validation",uk:"незалежна валідація",de:"unabhängige Validierung",nl:"onafhankelijke validatie",fr:"validation indépendante",es:"validación independiente",pl:"niezależna walidacja"},
 rYes:{en:"yes",uk:"так",de:"ja",nl:"ja",fr:"oui",es:"sí",pl:"tak"},
 rNo:{en:"no",uk:"ні",de:"nein",nl:"nee",fr:"non",es:"no",pl:"nie"},
 rPage:{en:"page %n of %m",uk:"сторінка %n з %m",de:"Seite %n von %m",nl:"pagina %n van %m",fr:"page %n sur %m",es:"página %n de %m",pl:"strona %n z %m"},
 rDisc:{en:"Experimental engineering tool for education, exploration and preliminary assessment. Verify every result independently before engineering use.",uk:"Експериментальний інженерний інструмент для навчання, дослідження та попередньої оцінки. Перед інженерним використанням незалежно перевіряйте кожен результат.",de:"Experimentelles Ingenieurwerkzeug für Ausbildung, Untersuchung und Vorabschätzung. Jedes Ergebnis vor der technischen Nutzung unabhängig überprüfen.",nl:"Experimenteel technisch hulpmiddel voor onderwijs, verkenning en voorlopige beoordeling. Controleer elk resultaat onafhankelijk vóór technisch gebruik.",fr:"Outil d'ingénierie expérimental pour l'enseignement, l'exploration et l'évaluation préliminaire. Vérifiez chaque résultat de façon indépendante avant tout usage technique.",es:"Herramienta de ingeniería experimental para enseñanza, exploración y evaluación preliminar. Verifique cada resultado de forma independiente antes de un uso técnico.",pl:"Eksperymentalne narzędzie inżynierskie do edukacji, eksploracji i wstępnej oceny. Każdy wynik należy zweryfikować niezależnie przed użyciem inżynierskim."},
 stPrototype:{en:"prototype",uk:"прототип",de:"Prototyp",nl:"prototype",fr:"prototype",es:"prototipo",pl:"prototyp"},
 /* Displayed label of the `benchmarked` tier — the schema enum is unchanged. */
 stBenchmarked:{en:"benchmark tested",uk:"перевірено за еталоном",de:"Benchmark geprüft",nl:"benchmark getoetst",fr:"testé sur banc d'essai",es:"contrastado con referencia",pl:"sprawdzone benchmarkiem"},
 /* Reserved: rendered only when validation.review documents a review by someone
    other than the author. Nothing holds this tier today. */
 stVerified:{en:"reviewed by a third party",uk:"перевірено третьою стороною",de:"von Dritten geprüft",nl:"door een derde beoordeeld",fr:"examiné par un tiers",es:"revisado por un tercero",pl:"zweryfikowane przez stronę trzecią"},
 rReport:{en:"Benchmark report",uk:"Звіт про бенчмарк",de:"Benchmark-Bericht",nl:"Benchmarkrapport",fr:"Rapport de banc d'essai",es:"Informe del banco de pruebas",pl:"Raport z benchmarku"}
};

/* ---------- language ---------- */
let langOverride=null;
const base=v=>String(v||"").toLowerCase().split("-")[0];
function currentLang(){
 if(langOverride&&LANGS.includes(langOverride))return langOverride;
 try{const q=base(new URLSearchParams(location.search).get("lang"));if(LANGS.includes(q))return q}catch(e){}
 try{const s=base(localStorage.getItem("diagram_site_lang"));if(LANGS.includes(s))return s}catch(e){}
 try{const s=base(localStorage.getItem("diagram_lang"));if(LANGS.includes(s))return s}catch(e){}
 const n=base((navigator.languages&&navigator.languages[0])||navigator.language);
 return LANGS.includes(n)?n:"en";
}
const tr=(k,l)=>{const d=T[k]||{};return d[l||currentLang()]||d.en||""};
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function pick(x,l){return x&&typeof x==="object"&&!Array.isArray(x)?(x[l]||x.en||""):String(x==null?"":x)}
function safe(fn,fb){return function(){try{return fn.apply(this,arguments)}catch(e){warn(e);return fb}}}
function warn(e){try{console.warn("[diagram-common]",e&&e.message||e)}catch(_){}}

/* ---------- raw DEFLATE / INFLATE (sync; identical wire format to CompressionStream
   "deflate-raw", which is stream-only and therefore cannot back a synchronous encode) ---------- */
const LBASE=[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEXT=[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DBASE=[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DEXT=[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
function litCode(v){if(v<144)return[0x30+v,8];if(v<256)return[0x190+v-144,9];if(v<280)return[v-256,7];return[0xC0+v-280,8]}
function deflateRaw(data){
 const out=[];let cur=0,nb=0;
 const put=(v,n)=>{for(let i=0;i<n;i++){cur|=((v>>>i)&1)<<nb;if(++nb===8){out.push(cur);cur=0;nb=0}}};
 const putc=(c,n)=>{for(let i=n-1;i>=0;i--){cur|=((c>>>i)&1)<<nb;if(++nb===8){out.push(cur);cur=0;nb=0}}};
 put(1,1);put(1,2);                                  /* BFINAL=1, BTYPE=01 (fixed Huffman) */
 const n=data.length,head=new Int32Array(65536).fill(-1),prev=new Int32Array(Math.max(1,n)).fill(-1);
 const h3=p=>((data[p]<<10)^(data[p+1]<<5)^data[p+2])&65535;
 const ins=p=>{if(p+3<=n){const h=h3(p);prev[p]=head[h];head[h]=p}};
 let i=0;
 while(i<n){
  let bl=0,bd=0;
  if(i+3<=n){let c=head[h3(i)],guard=0;
   while(c>=0&&guard++<24){const d=i-c;
    if(d>0&&d<=32768){let l=0;const mx=Math.min(258,n-i);
     while(l<mx&&data[c+l]===data[i+l])l++;
     if(l>bl){bl=l;bd=d;if(l>=mx)break}}
    c=prev[c];}}
  if(bl>=3){
   let lc=0;while(lc<28&&LBASE[lc+1]<=bl)lc++;
   const a=litCode(257+lc);putc(a[0],a[1]);if(LEXT[lc])put(bl-LBASE[lc],LEXT[lc]);
   let dc=0;while(dc<29&&DBASE[dc+1]<=bd)dc++;
   putc(dc,5);if(DEXT[dc])put(bd-DBASE[dc],DEXT[dc]);
   for(let k=0;k<bl;k++)ins(i+k);
   i+=bl;
  }else{const a=litCode(data[i]);putc(a[0],a[1]);ins(i);i++}
 }
 const e=litCode(256);putc(e[0],e[1]);
 if(nb)out.push(cur);
 return new Uint8Array(out);
}
function inflateRaw(buf){
 let pos=0,bit=0,o=new Uint8Array(Math.max(64,buf.length*6)),ol=0;
 const push=b=>{if(ol>=o.length){const t=new Uint8Array(o.length*2);t.set(o);o=t}o[ol++]=b};
 const bits=n=>{let v=0;for(let i=0;i<n;i++){if(pos>=buf.length)throw new Error("deflate: truncated");
  v|=((buf[pos]>>>bit)&1)<<i;if(++bit===8){bit=0;pos++}}return v};
 function tree(lens){let mx=0;for(const l of lens)if(l>mx)mx=l;
  const cnt=new Array(mx+1).fill(0);for(const l of lens)if(l)cnt[l]++;
  const nx=new Array(mx+1).fill(0);let code=0;
  for(let b=1;b<=mx;b++){code=(code+cnt[b-1])<<1;nx[b]=code}
  const m=new Map();for(let i=0;i<lens.length;i++){const l=lens[i];if(l)m.set(l+":"+(nx[l]++),i)}
  return{m,mx}}
 const sym=t=>{let c=0;for(let l=1;l<=t.mx;l++){c=(c<<1)|bits(1);const s=t.m.get(l+":"+c);if(s!==undefined)return s}throw new Error("deflate: bad code")};
 for(;;){
  const bfinal=bits(1),btype=bits(2);
  if(btype===0){if(bit){bit=0;pos++}const len=buf[pos]|(buf[pos+1]<<8);pos+=4;for(let i=0;i<len;i++)push(buf[pos++])}
  else{
   let lt,dt;
   if(btype===1){const ll=new Array(288);
    for(let i=0;i<144;i++)ll[i]=8;for(let i=144;i<256;i++)ll[i]=9;
    for(let i=256;i<280;i++)ll[i]=7;for(let i=280;i<288;i++)ll[i]=8;
    lt=tree(ll);dt=tree(new Array(30).fill(5))}
   else if(btype===2){
    const hlit=bits(5)+257,hdist=bits(5)+1,hclen=bits(4)+4;
    const ord=[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],cl=new Array(19).fill(0);
    for(let i=0;i<hclen;i++)cl[ord[i]]=bits(3);
    const ct=tree(cl),lens=[];
    while(lens.length<hlit+hdist){const s=sym(ct);
     if(s<16)lens.push(s);
     else if(s===16){const r=3+bits(2),p=lens[lens.length-1];for(let i=0;i<r;i++)lens.push(p)}
     else if(s===17){const r=3+bits(3);for(let i=0;i<r;i++)lens.push(0)}
     else{const r=11+bits(7);for(let i=0;i<r;i++)lens.push(0)}}
    lt=tree(lens.slice(0,hlit));dt=tree(lens.slice(hlit))}
   else throw new Error("deflate: bad block type");
   for(;;){const s=sym(lt);
    if(s<256)push(s);
    else if(s===256)break;
    else{const li=s-257,len=LBASE[li]+(LEXT[li]?bits(LEXT[li]):0);
     const ds=sym(dt),dist=DBASE[ds]+(DEXT[ds]?bits(DEXT[ds]):0);
     if(dist>ol)throw new Error("deflate: bad distance");
     for(let i=0;i<len;i++)push(o[ol-dist])}}
  }
  if(bfinal)break;
 }
 return o.slice(0,ol);
}
function b64u(a){let s="";for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);
 return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function unb64u(s){s=String(s).replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";
 const b=atob(s),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}

function encodeState(obj){
 const bytes=new TextEncoder().encode(JSON.stringify(obj));
 try{const d=deflateRaw(bytes);if(d.length<bytes.length)return "D"+b64u(d)}catch(e){warn(e)}
 return "J"+b64u(bytes);                       /* plain base64url fallback */
}
function decodeState(str){
 const s=String(str||"");if(!s)throw new Error("empty state");
 const tag=s[0],body=s.slice(1);
 let bytes;
 if(tag==="D")bytes=inflateRaw(unb64u(body));
 else if(tag==="J")bytes=unb64u(body);
 else bytes=unb64u(s);
 return JSON.parse(new TextDecoder().decode(bytes));
}

/* ---------- manifest ---------- */
let MANIFEST=null;
function manifest(){
 if(MANIFEST!==null)return MANIFEST;
 MANIFEST=false;
 try{const el=document.getElementById("diagram-tool-manifest");
  if(el)MANIFEST=JSON.parse(el.textContent)}catch(e){warn(e)}
 return MANIFEST;
}
const FILE=(location.pathname.split("/").pop()||"index.html");

/* ---------- config ---------- */
const CFG={id:"",file:"",title:null,state:null,record:null,python:null,handoff:null};
let started=false;
function toolId(){return CFG.id||(manifest()&&manifest().id)||FILE.replace(/\.html?$/,"")}
function toolFile(){return CFG.file||(manifest()&&manifest().file)||FILE}

/* ---------- site resolver ----------
   A namespace is not an address. A schema id such as the `/ui/v1` in RECORD_SCHEMA
   above names a contract and must never move; `<host>/decayheat.html` locates a
   page and must always follow the host the document was actually served from.

   Resolution order, memoised on first use — not at load, because a <head>
   script runs before the <meta> is parsed, and first use is always after
   DOMContentLoaded. The answer cannot change without a reload.
     1. <meta name="diagram-site"> — resolved against location.href. The override,
        for a staging host that should still cite the canonical one.
     2. http(s) document -> the document's OWN DIRECTORY, filename/query/hash
        stripped. Not location.origin: the tree has no root-absolute paths and no
        <base>, so a subdirectory deployment (https://example.com/tools/) stays
        correct only if the directory is kept.
     3. file: document -> the file's directory, and host "".
     4. a real http(s) location.origin (blob:, data:, sandboxed iframe) -> origin.
     5. last resort -> SITE_FALLBACK, host "".

   host==="" is the single signal for "no address a reader could use". It is what
   makes siteName() return a localised *local copy* instead of a disk path or
   Chromium's literal "null" — the benchmark runners open pages as file:// URLs,
   so this branch is exercised constantly. */
let SITE_MEMO=null;
function siteResolve(){
 if(SITE_MEMO)return SITE_MEMO;
 const mk=(b,h)=>({base:b,host:h||""});
 const dir=u=>u.replace(/[?#].*$/,"").replace(/[^/]*$/,"");
 let r=null;
 try{
  const el=document.querySelector('meta[name="diagram-site"]');
  const mv=el&&(el.getAttribute("content")||"").trim();
  if(mv){const u=new URL(mv,location.href);
   r=mk(u.href.replace(/[?#].*$/,"").replace(/\/*$/,"/"),/^https?:$/.test(u.protocol)?u.host:"")}
 }catch(e){warn(e)}
 if(!r)try{
  const u=new URL(location.href);
  if(/^https?:$/.test(u.protocol))r=mk(u.origin+dir(u.pathname),u.host);
  else if(u.protocol==="file:")r=mk(dir(u.href),"");
 }catch(e){warn(e)}
 if(!r)try{
  const o=location.origin;
  if(o&&/^https?:\/\//.test(o))r=mk(o.replace(/\/*$/,"/"),new URL(o).host);
 }catch(e){warn(e)}
 if(!r)r=mk(SITE_FALLBACK,"");
 SITE_MEMO=r;
 return r;
}
/* Absolute, always one trailing slash. For building addresses. */
function siteBase(){return siteResolve().base}
/* Host only — no scheme, no path. For brand prose and running headers. */
function siteName(l){const h=siteResolve().host;return h||tr("siteLocal",l)}
/* True when there is no address a reader elsewhere could open. */
function siteIsLocal(){return siteResolve().host===""}
/* "Where this came from", for a human: an absolute URL when one exists,
   otherwise `decayheat.html (local copy)` rather than a disk path. */
function siteSourceRef(l,f){
 const n=f||toolFile();
 return siteIsLocal()?n+" ("+tr("siteLocal",l)+")":siteBase()+n;
}
/* 14 pages carry a static <title>Tool — tools.petrov.re</title>, and static
   markup cannot be dynamic. Rewrite an EXACT trailing (or, on the index, an
   exact leading) canonical name to the live one. Exact and anchored only: a
   title that merely contains an em-dash must never be truncated. */
function fixDocTitle(){
 try{
  const canon="tools.petrov.re",live=siteName();
  if(live===canon)return document.title;
  const t=document.title;
  if(t.length>canon.length+3&&t.slice(-(canon.length+3))===" \u2014 "+canon)
   document.title=t.slice(0,-canon.length)+live;
  else if(t.length>canon.length+3&&t.slice(0,canon.length+3)===canon+" \u2014 ")
   document.title=live+t.slice(canon.length);
 }catch(e){warn(e)}
 return document.title;
}
function toolTitle(l){
 if(CFG.title)return pick(CFG.title,l);
 const m=manifest();if(m&&m.title)return pick(m.title,l);
 return document.title||toolId();
}
function toolStatus(){const m=manifest();return (m&&m.status)||"prototype"}
function toolIndep(){const m=manifest();if(!m)return false;
 return !!((m.validation&&m.validation.independent_validation)||m.independent_validation)}
function toolRev(){const m=manifest();return (m&&m.manifest_revision)||""}
function toolLimits(l){const m=manifest();return m&&m.limitations?pick(m.limitations,l):""}
function benchmarks(){const m=manifest();return (m&&m.validation&&Array.isArray(m.validation.benchmarks))?m.validation.benchmarks:[]}
/* `verified` is reserved for a documented review by someone other than the
   author (validation.review). Without that record the runtime shows the highest
   tier the evidence really supports, so the word is never rendered on a claim. */
function hasReview(){const m=manifest();const r=m&&m.validation&&m.validation.review;
 return !!((r&&typeof r==="object"&&Object.keys(r).length>0)||(typeof r==="string"&&r.trim()!==""))}
function shownStatus(){const s=toolStatus();
 if(s==="verified")return hasReview()?"verified":"benchmarked";
 return s==="benchmarked"?"benchmarked":"prototype"}
function statusWord(l){return tr({prototype:"stPrototype",benchmarked:"stBenchmarked",verified:"stVerified"}[shownStatus()]||"stPrototype",l)}
/* Benchmark report page for this tool, when an artifact exists to report on. */
function hasReport(){return benchmarks().some(b=>b&&b.artifact)}
function reportURL(l){return siteBase()+"benchmark.html?tool="+encodeURIComponent(toolId())+"&lang="+encodeURIComponent(l||currentLang())}
function benchTally(){let c=0,p=0;benchmarks().forEach(b=>{c+=(+b.cases||0);p+=(+b.passed||0)});return{cases:c,passed:p}}

/* ---------- state / permalink ---------- */
function serializeState(){
 if(!CFG.state||typeof CFG.state.serialize!=="function")return null;
 return safe(CFG.state.serialize,null)();
}
function stateLink(obj){
 const l=currentLang();
 const st=obj===undefined?serializeState():obj;
 let u=siteBase()+toolFile()+"?lang="+encodeURIComponent(l);
 if(st!==null&&st!==undefined)u+="&s="+encodeState(st);
 return u;
}
function readIncomingState(){
 let s=null;try{s=new URLSearchParams(location.search).get("s")}catch(e){}
 if(!s)return;
 if(!CFG.state||typeof CFG.state.deserialize!=="function")return;
 let obj;
 try{obj=decodeState(s)}catch(e){warn(e);notify(tr("badLink"),"err");return}
 try{CFG.state.deserialize(obj)}catch(e){warn(e);notify(tr("badLink"),"err")}
}

/* ---------- calculation record ---------- */
function nowISO(){return new Date().toISOString().replace(/\.\d{3}Z$/,"Z")}
function stamp(){return nowISO().replace(/[-:]/g,"").replace(/Z$/,"Z")}
function recordBuild(){
 const l=currentLang();
 const r=(CFG.record?safe(CFG.record,null)():null)||null;
 if(!r)return null;
 return{
  schema:RECORD_SCHEMA,
  tool:{id:toolId(),file:toolFile(),title:toolTitle(l),manifest_revision:toolRev(),
        status:toolStatus(),independent_validation:toolIndep()},
  generated_at:nowISO(),
  source:siteSourceRef(l),
  permalink:stateLink(),
  inputs:r.inputs||{},outputs:r.outputs||{},units:r.units||{},
  model:{equations:(r.model&&r.model.equations)||[],ranges:(r.model&&r.model.ranges)||[],notes:(r.model&&r.model.notes)||[]},
  warnings:r.warnings||[],
  limitations:toolLimits(l)
 };
}

/* ---------- downloads ---------- */
function download(name,mime,text){
 try{
  const b=new Blob([text],{type:mime+";charset=utf-8"}),u=URL.createObjectURL(b);
  const a=document.createElement("a");a.href=u;a.download=name;a.style.display="none";
  document.body.appendChild(a);a.click();
  setTimeout(()=>{URL.revokeObjectURL(u);a.remove()},1500);
 }catch(e){warn(e)}
}
function csvCell(v){const s=String(v==null?"":v);
 return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function recordCSV(rec){
 const rows=[["key","value","unit"]];
 rows.push(["tool.id",rec.tool.id,""],["tool.file",rec.tool.file,""],["tool.title",rec.tool.title,""],
  ["tool.status",rec.tool.status,""],["tool.independent_validation",rec.tool.independent_validation,""],
  ["generated_at",rec.generated_at,""],["source",rec.source,""],["permalink",rec.permalink,""]);
 for(const k of Object.keys(rec.inputs))rows.push(["inputs."+k,rec.inputs[k],rec.units[k]||""]);
 for(const k of Object.keys(rec.outputs))rows.push(["outputs."+k,rec.outputs[k],rec.units[k]||""]);
 rec.model.equations.forEach((e,i)=>rows.push(["model.equations["+i+"]",e,""]));
 rec.model.ranges.forEach((e,i)=>rows.push(["model.ranges["+i+"]",e,""]));
 rec.model.notes.forEach((e,i)=>rows.push(["model.notes["+i+"]",e,""]));
 rec.warnings.forEach((e,i)=>rows.push(["warnings["+i+"]",e,""]));
 rows.push(["limitations",rec.limitations,""]);
 return rows.map(r=>r.map(csvCell).join(",")).join("\r\n")+"\r\n";
}

/* ---------- PDF report ---------- */
const colon=l=>(l==="fr"?" : ":": ");
/* Footer stamped on every printed page. The source URL is mandatory and comes
   first; a benchmarked tool adds the report URL so a printed PDF leads back to
   the evidence. The page counter always closes the line. */
function attribution(o){
 o=o||{};
 const l=o.lang||currentLang();
 let s=tr("rSource",l)+colon(l)+siteSourceRef(l)+" · "+(o.timestamp||nowISO())+" · "
      +(o.status||statusWord(l))+", "+tr("rIndep",l)+colon(l)+((o.independent!==undefined?o.independent:toolIndep())?tr("rYes",l):tr("rNo",l));
 const ru=o.report!==undefined?o.report:(hasReport()?reportURL(l):"");
 if(ru)s+=" · "+tr("rReport",l)+colon(l)+ru;
 if(o.page&&o.pages)s+=" · "+tr("rPage",l).replace("%n",o.page).replace("%m",o.pages);
 return s;
}
function benchSummary(l){
 const bs=benchmarks();if(!bs.length)return null;
 return bs.map(b=>({
  id:b.id||"",
  cases:tr("rCases",l).replace("%p",b.passed).replace("%c",b.cases),
  ref:b.reference||"",cit:(b.citations||[]).join(" — "),
  tol:b.tolerance||"",run:b.run_at||"",art:b.artifact||""}));
}
/* One rule for what a tool-supplied value prints as. Everything a tool hands
   the report ends up inside esc(), which is String() — and the rest of the
   framework has two non-string value shapes that are deliberate, not mistakes:
   a six-language label object, and the results-table cell descriptor
   {value, precision, unit, text} that `DiagramUI.tableCell` accepts. The report
   printed both as "[object Object]" — a legal on-screen cell became a lie on
   paper. Anything ELSE still falls through to fmtCell, which prints readable
   JSON: an unexpected shape must stay visible, not be quietly rescued. */
function cellText(v,l){
 if(v==null)return "";
 if(typeof v!=="object")return String(v);
 if(v.nodeType===1)return String(v.textContent==null?"":v.textContent);
 if(!Array.isArray(v)){
  const ks=Object.keys(v);
  if(ks.length&&ks.every(k=>LANGS.indexOf(k)>=0))return pick(v,l||currentLang());
  if(v.text!==undefined)return cellText(v.text,l);
  if(v.value!==undefined){
   const n=v.value;
   const body=(typeof n==="number"&&isFinite(n)&&v.precision!=null&&v.precision>=0)
    ?n.toFixed(v.precision):cellText(n,l);
   return body+(v.unit!==undefined&&v.unit!==""?" "+cellText(v.unit,l):"");
  }
 }
 return fmtCell(v);
}
/* flow item helpers -> HTML strings, one top-level element per item */
function fH(txt,lvl){return '<div class="h'+(lvl||2)+'">'+esc(txt)+"</div>"}
function fP(txt,cls){return '<div class="p'+(cls?" "+cls:"")+'">'+esc(txt)+"</div>"}
function fRow(cells,cls,tbl,head){
 return '<div class="r'+(cls?" "+cls:"")+(head?" rh":"")+'"'+(tbl?' data-tbl="'+esc(tbl)+'"':"")
  +(head?' data-head="1"':"")+">"+cells.map(c=>"<span>"+esc(c)+"</span>").join("")+"</div>";
}
/* ---- figures (§1.3): raster via data: URL, vector via inline SVG ----
   Nothing may be fetched from the network, so an image source that is not a
   `data:` URL is refused and the omission is printed instead of silently
   dropping the figure. Each figure is one top-level flow item, so it
   paginates like any other block and the per-page footer stays intact. */
const DATA_IMG=/^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)\s*[;,]/i;
/* How long the report pager will wait for its raster figures to decode before
   laying out anyway. data: URLs decode from memory, so this is a backstop for
   a corrupt one, not a budget: it must stay well under the 3 s that report()
   polls __reportReady for, or a slow decode would print an unpaginated page. */
const IMG_WAIT_MS=1500;
function figWrap(inner,cap,width,l){
 return '<div class="fig"'+(width?' style="width:'+esc(width)+';margin-left:auto;margin-right:auto"':"")+">"
  +inner+(cap?'<div class="figcap">'+esc(cap)+"</div>":"")+"</div>";
}
function fImage(src,cap,width,alt,l){
 const s=String(src&&src.src!==undefined?src.src:src||"");
 if(!DATA_IMG.test(s.trim())){warn("report figure refused: image source is not a data: URL");
  return fP(tr("rImgOff",l),"small")}
 return figWrap('<img src="'+esc(s.trim())+'" alt="'+esc(alt||cap||"")+'">',cap,width,l);
}
/* Inline SVG is sanitised: no scripts, no event handlers, no external
   references — the printed report must stay offline and inert. */
function sanitizeSVG(markup){
 let s=String(markup==null?"":markup);
 s=s.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi,"");
 s=s.replace(/<\s*\/?\s*(script|foreignobject|iframe|object|embed|link|meta)\b[^>]*>/gi,"");
 s=s.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,"");
 s=s.replace(/\s(?:xlink:)?href\s*=\s*(["'])(?!\s*(?:#|data:))[^"']*\1/gi,"");
 s=s.replace(/javascript:/gi,"");
 return s;
}
function fSvg(markup,cap,width,l){
 const raw=String(markup&&markup.markup!==undefined?markup.markup:markup||"").trim();
 if(!/^<svg[\s>]/i.test(raw)){warn("report figure refused: svg section is not inline <svg> markup");
  return fP(tr("rImgOff",l),"small")}
 return figWrap(sanitizeSVG(raw),cap,width,l);
}
/* one figure spec, or an array of them, -> flow items */
function figItems(v,kind,l){
 const list=Array.isArray(v)?v:[v];
 return list.filter(x=>x!=null&&x!=="").map(x=>{
  const o=(typeof x==="object")?x:{};
  const cap=o.caption||o.title||"",w=o.width||"",alt=o.alt||"";
  return kind==="svg"?fSvg(o.markup!==undefined?o.markup:(o.svg!==undefined?o.svg:x),cap,w,l)
                     :fImage(o.src!==undefined?o.src:(o.image!==undefined?o.image:x),cap,w,alt,l);
 });
}
function sectionItems(sections,l){
 const it=[];
 (sections||[]).forEach(sec=>{
  if(!sec)return;
  if(sec.title)it.push(fH(cellText(sec.title,l),2));
  if(sec.text)it.push(fP(cellText(sec.text,l)));
  if(sec.image)figItems(sec.image,"image",l).forEach(x=>it.push(x));
  if(sec.svg)figItems(sec.svg,"svg",l).forEach(x=>it.push(x));
  const tid="s"+Math.random().toString(36).slice(2,8);
  const st=sec.cols?' style="grid-template-columns:'+esc(sec.cols)+'"':"";
  if(sec.head)it.push(fRow(sec.head.map(x=>cellText(x,l)),"cN",tid,true).replace("<div ",'<div'+st+" "));
  (sec.rows||[]).forEach(r=>it.push(fRow((r||[]).map(x=>cellText(x,l)),"cN",tid).replace("<div ",'<div'+st+" ")));
  (sec.notes||[]).forEach(n=>it.push(fP(cellText(n,l),"small")));
  if(sec.html)it.push(String(sec.html));
 });
 return it;
}
/* Helpers handed to a tool's own `report.render(rec, ctx)`; every helper
   returns one or more top-level flow items as an HTML string, so whatever the
   tool builds still paginates under the runtime's attributed footer. */
function renderCtx(rec,l){
 return{
  lang:l,record:rec,esc:esc,
  h:(t,lvl)=>fH(cellText(t,l),lvl||2),
  p:(t,cls)=>fP(cellText(t,l),cls),
  kv:(k,v,cls)=>fRow([cellText(k,l),cellText(v,l)],"kv"+(cls?" "+cls:"")),
  url:u=>'<div class="url">'+esc(u)+"</div>",
  table:o=>{o=o||{};const tid="r"+Math.random().toString(36).slice(2,8);
   const st=o.cols?' style="grid-template-columns:'+esc(o.cols)+'"':"";
   const out=[];
   if(o.title)out.push(fH(cellText(o.title,l),2));
   if(o.head)out.push(fRow(o.head.map(x=>cellText(x,l)),"cN",tid,true).replace("<div ",'<div'+st+" "));
   (o.rows||[]).forEach(r=>out.push(fRow((r||[]).map(x=>cellText(x,l)),"cN",tid).replace("<div ",'<div'+st+" ")));
   return out.join("")},
  image:(src,o)=>figItems(Object.assign({src:src},o||{}),"image",l).join(""),
  svg:(markup,o)=>figItems(Object.assign({markup:markup},o||{}),"svg",l).join(""),
  sections:secs=>sectionItems(secs,l).join(""),
  raw:h=>String(h==null?"":h)
 };
}
function reportItems(rec,opts,l){
 const it=[];
 it.push('<div class="doctitle">'+esc(tr("rTitle",l))+" · "+esc(rec.tool.title)+"</div>");
 it.push(fRow([tr("rGen",l),rec.generated_at],"kv"));
 it.push(fRow([tr("rSource",l),rec.source],"kv"));
 it.push(fRow(["Status",statusWord(l)+", "+tr("rIndep",l)+colon(l)+(rec.tool.independent_validation?tr("rYes",l):tr("rNo",l))],"kv"));
 it.push(fRow(["Revision",rec.tool.manifest_revision||"—"],"kv"));
 it.push(fH(tr("rPerma",l),2));
 it.push('<div class="url">'+esc(rec.permalink)+"</div>");
 if(rec.limitations){it.push(fH(tr("rLimits",l),2));it.push(fP(cellText(rec.limitations,l)))}
 const bs=(rec.tool.status==="benchmarked"||rec.tool.status==="verified")?benchSummary(l):null;
 if(bs&&bs.length){
  it.push(fH(tr("rBench",l),2));
  bs.forEach(b=>{
   it.push(fRow([b.id||tr("rBench",l),b.cases],"kv"));
   if(b.ref)it.push(fRow([tr("rRef",l),b.ref],"kv"));
   if(b.cit)it.push(fRow(["",b.cit],"kv small"));
   if(b.tol)it.push(fRow([tr("rTol",l),b.tol],"kv"));
   if(b.run)it.push(fRow([tr("rRun",l),b.run],"kv"));
   if(b.art)it.push(fRow(["Artifact",siteBase()+b.art],"kv"));
  });
  if(hasReport())it.push(fRow([tr("rReport",l),reportURL(l)],"kv"));
 }
 /* Body: the tool's own `report.render` replaces the default record dump, but
    never the attributed head above or the footer the pager stamps. */
 let body=null;
 if(!opts.body&&CFG.report&&typeof CFG.report.render==="function")
  body=safe(CFG.report.render,null)(rec,renderCtx(rec,l));
 else if(opts.body)body=opts.body;
 if(body!=null&&body!==false&&body!==""){
  (Array.isArray(body)?body:[body]).forEach(x=>{if(x!=null&&x!=="")it.push(String(x))});
 }else{
  const kvSec=(title,obj)=>{
   const ks=Object.keys(obj||{});if(!ks.length)return;
   it.push(fH(title,2));
   it.push(fRow([tr("rProp",l),tr("rVal",l),tr("rUnit",l)],"c3","t-"+title,true));
   ks.forEach(k=>it.push(fRow([k,fmtCell(obj[k]),rec.units[k]||""],"c3","t-"+title)));
  };
  kvSec(tr("rInputs",l),rec.inputs);
  kvSec(tr("rOutputs",l),rec.outputs);
  const m=rec.model||{};
  if((m.equations||[]).length||(m.ranges||[]).length||(m.notes||[]).length){
   it.push(fH(tr("rModel",l),2));
   if((m.equations||[]).length){it.push(fH(tr("rEq",l),3));m.equations.forEach(e=>it.push(fP(e,"mono")))}
   if((m.ranges||[]).length){it.push(fH(tr("rRanges",l),3));m.ranges.forEach(e=>it.push(fP(e)))}
   if((m.notes||[]).length){it.push(fH(tr("rNotes",l),3));m.notes.forEach(e=>it.push(fP(e)))}
  }
  if((rec.warnings||[]).length){it.push(fH(tr("rWarn",l),2));rec.warnings.forEach(w=>it.push(fP(cellText(w,l),"warn")))}
 }
 sectionItems(opts.sections,l).forEach(x=>it.push(x));
 it.push(fP(tr("rDisc",l),"small"));
 return it;
}
/* A record value may be a nested structure; keep the table cell readable. */
function fmtCell(v){
 if(v==null)return "";
 if(typeof v==="object"){try{const s=JSON.stringify(v);return s.length>160?s.slice(0,157)+"…":s}catch(e){return String(v)}}
 return String(v);
}
function reportHTML(opts){
 opts=opts||{};
 const l=opts.lang||currentLang();
 const rec=opts.record||recordBuild();
 if(!rec)return null;
 if(!opts.sections)opts=Object.assign({},opts,{sections:sectionsFor(rec)});
 const items=reportItems(rec,opts,l);
 const foot={pre:attribution({lang:l,timestamp:rec.generated_at,status:statusWord(l),
   independent:rec.tool.independent_validation})+" · ",
  page:tr("rPage",l)};
 const head=rec.tool.title+" · "+siteName(l);
 const meta=JSON.stringify({head:head,foot:foot});
 return '<!doctype html><html lang="'+l+'"><head><meta charset="utf-8">'
 +'<title>'+esc(rec.tool.title)+" — "+esc(tr("rTitle",l))+"</title><style>"
 +"@page{size:A4;margin:0}"
 +'html,body{margin:0;padding:0;background:#fff;color:#14181d;font:10.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
 +".page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;page-break-after:always;break-after:page}"
 +".page:last-child{page-break-after:auto;break-after:auto}"
 +".ph{position:absolute;left:15mm;right:15mm;top:11mm;font-size:9px;color:#4a5460;border-bottom:.4pt solid #b9c0c8;padding-bottom:1.6mm;display:flex;justify-content:space-between;gap:6mm}"
 +".pc{position:absolute;left:15mm;right:15mm;top:20mm;bottom:17mm;overflow:hidden}"
 +".pf{position:absolute;left:15mm;right:15mm;bottom:9mm;font-size:7.6px;line-height:1.35;color:#333b44;border-top:.4pt solid #b9c0c8;padding-top:1.4mm;word-break:break-all}"
 +".doctitle{font-size:17px;font-weight:700;margin:0 0 3mm}"
 +".h2{font-size:12px;font-weight:700;margin:4mm 0 1.4mm;color:#101720}"
 +".h3{font-size:10.5px;font-weight:700;margin:2.6mm 0 1mm;color:#26313d}"
 +".p{margin:0 0 1.4mm;text-align:justify}.p.small{font-size:8.6px;color:#4a5460}.p.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:9px;background:#f4f6f9;padding:1mm 1.6mm;border-left:2pt solid #c3ccd6}"
 +".p.warn{background:#fff6e2;border-left:2pt solid #d19b1d;padding:1mm 1.6mm}"
 +".url{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:8.8px;word-break:break-all;background:#f4f6f9;padding:1.2mm 1.6mm;margin:0 0 1.6mm;user-select:all}"
 +".r{display:grid;gap:2mm;padding:.85mm 0;border-bottom:.2pt solid #e4e8ed}"
 +".r span{overflow-wrap:anywhere}"
 +".r.kv{grid-template-columns:34mm 1fr}.r.kv.small{font-size:8.6px;color:#4a5460}"
 +".r.c3{grid-template-columns:1fr 34mm 24mm}.r.c3 span:nth-child(2){text-align:right;font-variant-numeric:tabular-nums}"
 +".r.cN{grid-template-columns:repeat(auto-fit,minmax(0,1fr));font-variant-numeric:tabular-nums}"
 +".r.rh{font-weight:700;border-bottom:.5pt solid #9aa4ae;color:#26313d}"
 /* figures: never wider than the text column, never taller than one page body,
    so a figure item always fits the page the pager put it on */
 +".fig{margin:0 0 2mm;text-align:center;break-inside:avoid;page-break-inside:avoid;max-width:100%}"
 +".fig img,.fig svg{max-width:100%;max-height:225mm;width:auto;height:auto;display:block;margin:0 auto}"
 +".figcap{font-size:8.6px;color:#4a5460;margin:1mm 0 0;text-align:center}"
 +"@media screen{body{background:#5b626b;padding:8px 0}.page{margin:0 auto 8px;box-shadow:0 2px 12px rgba(0,0,0,.45)}}"
 +"</style></head><body><div id=\"src\" style=\"display:none\">"+items.join("")+"</div><div id=\"out\"></div>"
 +"<script>(function(){var M="+meta+";"
 +"var src=document.getElementById('src'),out=document.getElementById('out'),items=[].slice.call(src.children);"
 +"var heads={},pages=[];function np(){var p=document.createElement('div');p.className='page';"
 +"var h=document.createElement('div');h.className='ph';h.innerHTML='<span></span><span></span>';"
 +"h.firstChild.textContent=M.head;var c=document.createElement('div');c.className='pc';"
 +"var f=document.createElement('div');f.className='pf';p.appendChild(h);p.appendChild(c);p.appendChild(f);"
 +"out.appendChild(p);var o={p:p,c:c,f:f};pages.push(o);return o}"
 +"function lay(){"
 +"var pg=np();for(var i=0;i<items.length;i++){var el=items[i];var tbl=el.getAttribute('data-tbl');"
 +"if(el.getAttribute('data-head')&&tbl)heads[tbl]=el;pg.c.appendChild(el);"
 +"if(pg.c.scrollHeight>pg.c.clientHeight&&pg.c.children.length>1){pg.c.removeChild(el);pg=np();"
 +"if(tbl&&heads[tbl]&&heads[tbl]!==el)pg.c.appendChild(heads[tbl].cloneNode(true));pg.c.appendChild(el);}}"
 +"for(var k=0;k<pages.length;k++){pages[k].f.textContent=M.foot.pre+M.foot.page.replace('%n',k+1).replace('%m',pages.length);"
 +"pages[k].p.querySelector('.ph').lastChild.textContent=M.foot.page.replace('%n',k+1).replace('%m',pages.length);}"
 +"src.parentNode.removeChild(src);window.__reportPages=pages.length;window.__reportReady=true;"
 +"try{document.dispatchEvent(new Event('diagram-report-ready'))}catch(e){}}"
 /* A raster figure carries its height in its bytes, not in its markup: an
    <img> that has not decoded yet measures 0 px tall, the pager sees the page
    as still empty, takes no break, and .pc{overflow:hidden} silently eats
    everything after it. So decode every <img> BEFORE the first append. Inline
    SVG needs none of this — it lays out from its own markup. The wait is
    bounded by IMG_WAIT_MS: a data: URL that never decodes must cost the reader a
    clipped figure, never a report that never appears. With no <img> at all the
    call is synchronous, exactly as it was, so a report without a raster figure
    is laid out on the same tick and byte-for-byte the same as before. */
 +"var imgs=[].slice.call(src.getElementsByTagName('img'));"
 +"if(!imgs.length){lay();return}"
 +"var left=imgs.length,fired=false,tm=0;"
 +"function go(){if(fired)return;fired=true;if(tm)clearTimeout(tm);lay()}"
 +"function one(){if(--left<=0)go()}"
 +"tm=setTimeout(go,"+IMG_WAIT_MS+");"
 +"for(var j=0;j<imgs.length;j++){(function(im){"
 +"if(im.complete&&im.naturalWidth){one();return}"
 +"if(typeof im.decode==='function'){try{im.decode().then(one,one);return}catch(e){}}"
 +"im.onload=im.onerror=one;"
 +"if(im.complete)one()})(imgs[j])}"
 +"})();<\/script></body></html>";
}
function report(opts){
 opts=opts||{};
 const html=reportHTML(opts);
 if(!html){notify(tr("noRecord"),"err");return null}
 if(opts.mode==="html")return html;
 let fr=document.getElementById("dgc-report-frame");
 if(fr)fr.remove();
 fr=document.createElement("iframe");
 fr.id="dgc-report-frame";
 fr.setAttribute("aria-hidden","true");
 fr.style.cssText="position:fixed;left:-10000px;top:0;width:230mm;height:320mm;border:0;visibility:hidden";
 fr.srcdoc=html;
 fr.onload=()=>{
  const go=()=>{try{fr.contentWindow.focus();fr.contentWindow.print()}catch(e){warn(e)}};
  try{
   const w=fr.contentWindow;
   if(w.__reportReady)go();
   else{let n=0;const iv=setInterval(()=>{if(w.__reportReady||++n>60){clearInterval(iv);go()}},50)}
  }catch(e){warn(e);go()}
 };
 document.body.appendChild(fr);
 return fr;
}
report.attribution=attribution;
report.url=l=>(hasReport()?reportURL(l):"");
report.html=o=>reportHTML(Object.assign({},o,{mode:"html"}));

/* ---------- python export ---------- */
function pyStr(s){return JSON.stringify(String(s==null?"":s))}
function pyLit(v){
 if(v===null||v===undefined)return "None";
 if(typeof v==="number")return isFinite(v)?String(v):(v>0?'float("inf")':(v<0?'float("-inf")':'float("nan")'));
 if(typeof v==="boolean")return v?"True":"False";
 if(Array.isArray(v))return "["+v.map(pyLit).join(", ")+"]";
 if(typeof v==="object")return "{"+Object.keys(v).map(k=>pyStr(k)+": "+pyLit(v[k])).join(", ")+"}";
 return pyStr(v);
}
function pyIdent(k){let s=String(k).replace(/[^A-Za-z0-9_]/g,"_").toUpperCase();
 if(/^[0-9]/.test(s))s="_"+s;return s}
function wrapComment(txt,w){
 const words=String(txt).split(/\s+/);const out=[];let line="#   ";
 for(const wd of words){if((line+wd).length>(w||96)){out.push(line);line="#   "+wd}else line+=(line.trim()==="#"?"":" ")+wd}
 if(line.trim()!=="#")out.push(line);
 return out.join("\n").replace(/#\s+$/,"");
}
function pythonEmit(){
 const l=currentLang();
 const m=manifest();
 const pe=(m&&m.python_export)||{supported:!!CFG.python};
 if(pe.supported===false)return{error:pick(pe.reason,l)||"not supported"};
 if(!CFG.python)return{error:"no python provider"};
 const rec=recordBuild();
 if(!rec)return{error:"no record"};
 const spec=safe(CFG.python,null)();
 if(!spec)return{error:"no python code"};
 /* §1.4: a provider may decline the current state and say why. */
 const decl=(spec.unsupported!==undefined&&spec.unsupported!==false&&spec.unsupported!==null)?spec.unsupported
           :(spec.supported===false?(spec.reason||true):null);
 if(decl!==null&&decl!==undefined){
  const why=(decl===true?"":pick(decl,l))||pick(spec.reason,l)||"not available for the current state";
  return{error:why,reason:why,unsupported:true,state_dependent:true};
 }
 if(!spec.code)return{error:"no python code"};
 const req=spec.requires||(m&&m.python_export&&m.python_export.requires)||[];
 const st=(spec.selftest&&typeof spec.selftest==="object")?spec.selftest:{};
 const tol=st.tolerance!==undefined?st.tolerance:1e-9;
 /* §1.4 scoped export: `covers` names the outputs this script really
    reproduces. Absent -> every recorded output, as before. */
 const outAll=Object.keys(rec.outputs);
 const cvRaw=Array.isArray(spec.covers)?spec.covers:(Array.isArray(st.covers)?st.covers:null);
 let covered=outAll,notCovered=[],cvUnknown=[];
 if(cvRaw){
  const want=cvRaw.map(String);
  covered=want.filter(k=>outAll.indexOf(k)>=0);
  cvUnknown=want.filter(k=>outAll.indexOf(k)<0);
  notCovered=outAll.filter(k=>covered.indexOf(k)<0);
  if(!covered.length)return{error:"python export declares covers[] but none of "+want.join(", ")+" is a recorded output"};
 }
 const scoped=!!cvRaw&&notCovered.length>0;
 const L=[];
 L.push("#!/usr/bin/env python3");
 L.push("# -*- coding: utf-8 -*-");
 L.push('"""'+rec.tool.title+" — exported calculation");
 L.push("");
 L.push("Source:            "+rec.source);
 L.push("Manifest revision: "+(rec.tool.manifest_revision||"—"));
 L.push("Generated:         "+rec.generated_at);
 L.push("Permalink:         "+rec.permalink);
 L.push("Status:            "+rec.tool.status+", independent validation: "+(rec.tool.independent_validation?"yes":"no"));
 if(spec.scope)L.push("Reproduces:        "+spec.scope);
 /* Say plainly what this script does and does not reproduce (§1.4). */
 L.push("");
 if(scoped){
  L.push("SCOPE — this is a partial export.");
  L.push("  Reproduced by this script ("+covered.length+" of "+outAll.length+" recorded outputs):");
  L.push(wrapComment(covered.join(", "),96).replace(/^#\s{0,3}/gm,"    "));
  L.push("  NOT reproduced here (shown by the tool, computed by a part this script does not carry):");
  L.push(wrapComment(notCovered.join(", "),96).replace(/^#\s{0,3}/gm,"    "));
  L.push("  The self-test below therefore asserts only the reproduced outputs.");
 }else{
  L.push("This script reproduces every output the tool recorded ("+outAll.length+"), and its");
  L.push("self-test asserts all of them.");
 }
 if(cvUnknown.length)L.push("  (declared but absent from the record, ignored: "+cvUnknown.join(", ")+")");
 /* §1.4.0: the export runs on a bare python3, standard library only. A
    surviving `requires` entry is an exception and is printed as one — with the
    tool's one-line justification, or with the fact that it did not give one —
    and the reader is warned before the numbers, not after. `basis` then says
    which claim the script is making: reproduce (the norm), recompute or mixed. */
 L.push("");
 const dep=req.length>0;
 L.push("Dependencies:      "+(dep?req.join(", "):"none — python3 standard library only"));
 if(dep){
  L.push("  !! THIS SCRIPT DOES NOT RUN ON A BARE python3. The site's rule is standard library");
  L.push("  !! only (framework spec §1.4.0); the packages above are an exception to it.");
  L.push("  Justification: "+(pick(spec.requires_reason,l)||"NOT STATED by the tool."));
 }
 let bs=spec.basis;
 if(typeof bs==="string")bs={kind:"mixed",note:bs};
 if(bs&&typeof bs==="object"){
  const kind=String(bs.kind||"mixed").toLowerCase();
  const word=kind==="reproduce"?"REPRODUCES the tool's own computation"
            :kind==="recompute"?"RECOMPUTES from another model — this is not the tool's own computation"
            :"MIXED — part reproduced from the tool's own model, part recomputed from another";
  L.push("Basis:             "+word);
  if(pick(bs.note,l))L.push(wrapComment(pick(bs.note,l),96).replace(/^#\s{0,3}/gm,"  "));
  const dev=pick(bs.deviation,l)||(kind!=="reproduce"?"NOT STATED by the tool.":"");
  if(dev){L.push("  Expected difference against the tool:");
   L.push(wrapComment(dev,96).replace(/^#\s{0,3}/gm,"    "));}
 }else if(dep){
  L.push("Basis:             NOT STATED by the tool, although it declares "+req.join(", ")+
         " — treat the numbers below as recomputed, not as the tool's own.");
 }else{
  L.push("Basis:             REPRODUCES the tool's own computation. Nothing replaces its model,");
  L.push("  and the script needs nothing but the python3 standard library.");
 }
 L.push("Self-test tolerance: "+tol+" relative");
 if(st.note)L.push(wrapComment(pick(st.note,l),96).replace(/^#\s{0,3}/gm,"  "));
 L.push("");
 L.push("Limitations:");
 L.push(wrapComment(rec.limitations,96).replace(/^#\s{0,3}/gm,"  "));
 if((rec.model.equations||[]).length){
  L.push("");L.push("Equations:");
  rec.model.equations.forEach(e=>L.push("  - "+e));
 }
 if((rec.model.ranges||[]).length){
  L.push("");L.push("Validity ranges:");
  rec.model.ranges.forEach(e=>L.push("  - "+e));
 }
 L.push('"""');
 L.push("# requires: "+(req.length?req.join(", "):"python3 standard library only"));
 L.push("");
 L.push("import math");
 (req||[]).forEach(r=>L.push("import "+String(r).split(/[<>=\s]/)[0]));
 L.push("");
 L.push("# ---- inputs as recorded by the tool at export time ----");
 L.push("INPUTS = {");
 Object.keys(rec.inputs).forEach(k=>{
  L.push("    "+pyStr(k)+": "+pyLit(rec.inputs[k])+","+(rec.units[k]?"  # "+rec.units[k]:""));
 });
 L.push("}");
 Object.keys(rec.inputs).forEach(k=>{
  L.push(pyIdent(k)+" = "+pyLit(rec.inputs[k])+(rec.units[k]?"  # "+rec.units[k]:""));
 });
 L.push("");
 L.push("UNITS = "+pyLit(rec.units));
 L.push("");
 L.push("# ---- model ----");
 L.push(spec.code.replace(/\r/g,""));
 L.push("");
 L.push("# ---- values displayed by the tool at export time ----");
 L.push("# EXPECTED holds only what this script reproduces; NOT_REPRODUCED names the rest.");
 L.push("EXPECTED = {");
 covered.forEach(k=>{L.push("    "+pyStr(k)+": "+pyLit(rec.outputs[k])+",")});
 L.push("}");
 L.push("NOT_REPRODUCED = "+pyLit(notCovered));
 if(spec.displayed){
  const dsp=spec.displayed;
  let d=dsp;
  if(scoped&&dsp&&typeof dsp==="object"&&!Array.isArray(dsp)){
   d={};Object.keys(dsp).forEach(k=>{if(covered.indexOf(k)>=0)d[k]=dsp[k]});
  }
  L.push("DISPLAYED = "+pyLit(d));
 }
 L.push("TOLERANCE = "+pyLit(tol)+"  # "+(st.note||"relative deviation permitted between this script and the tool"));
 L.push("");
 L.push("");
 L.push("def _flatten(prefix, v, out):");
 L.push('    """Reduce a nested output (dict/list) to comparable scalar leaves."""');
 L.push("    if isinstance(v, dict):");
 L.push("        for k in v:");
 L.push("            _flatten('%s.%s' % (prefix, k), v[k], out)");
 L.push("    elif isinstance(v, (list, tuple)):");
 L.push("        for i, x in enumerate(v):");
 L.push("            _flatten('%s[%d]' % (prefix, i), x, out)");
 L.push("    else:");
 L.push("        out[prefix] = v");
 L.push("    return out");
 L.push("");
 L.push("");
 L.push("def _isnum(x):");
 L.push("    return isinstance(x, (int, float)) and not isinstance(x, bool)");
 L.push("");
 L.push("");
 L.push("def selftest(tol=TOLERANCE):");
 L.push('    """Assert this script reproduces what the tool displayed at export time.');
 L.push("");
 L.push("    Only the outputs in EXPECTED are asserted; NOT_REPRODUCED lists the ones");
 L.push("    this script deliberately does not carry. Nested outputs are flattened to");
 L.push("    scalars: numbers are compared relatively, everything else by equality, and");
 L.push("    a leaf that cannot be compared at all is counted as skipped, never ignored");
 L.push('    silently."""');
 L.push("    got = compute()");
 L.push("    bad = []");
 L.push("    skipped = []");
 L.push("    checked = 0");
 L.push("    for k, ref in EXPECTED.items():");
 L.push("        if ref is None:");
 L.push("            continue");
 L.push("        v = got.get(k) if hasattr(got, 'get') else None");
 L.push("        if v is None:");
 L.push("            bad.append('%s: not returned by compute()' % k)");
 L.push("            continue");
 L.push("        A = _flatten('', ref, {})");
 L.push("        B = _flatten('', v, {})");
 L.push("        absent = [p for p in A if p not in B]");
 L.push("        if absent:");
 L.push("            bad.append('%s: script result has no %s' % (k, ', '.join(sorted(absent)[:8])))");
 L.push("            continue");
 L.push("        for p in A:");
 L.push("            r, g = A[p], B[p]");
 L.push("            name = k + p");
 L.push("            if _isnum(r) and _isnum(g):");
 L.push("                checked += 1");
 L.push("                rel = abs(g - r) / max(abs(r), 1e-30)");
 L.push("                if rel > tol:");
 L.push("                    bad.append('%s: got %.12g, tool showed %.12g, rel %.3g' % (name, g, r, rel))");
 L.push("            elif isinstance(r, (str, bool)) or r is None or isinstance(g, (str, bool)) or g is None:");
 L.push("                checked += 1");
 L.push("                if g != r:");
 L.push("                    bad.append('%s: got %r, tool showed %r' % (name, g, r))");
 L.push("            else:");
 L.push("                skipped.append(name)");
 L.push("    if 'DISPLAYED' in globals() and 'fmt' in globals():");
 L.push("        for k, ref in DISPLAYED.items():");
 L.push("            try:");
 L.push("                s = fmt(got.get(k))");
 L.push("            except Exception as exc:");
 L.push("                bad.append('%s: formatting failed (%s)' % (k, exc))");
 L.push("                continue");
 L.push("            checked += 1");
 L.push("            if s != ref:");
 L.push("                bad.append('%s: formatted %r, tool displayed %r' % (k, s, ref))");
 L.push("    assert not bad, 'self-test FAILED:\\n  ' + '\\n  '.join(bad)");
 L.push("    selftest.checked = checked");
 L.push("    selftest.skipped = skipped");
 L.push("    return True");
 L.push("");
 if(spec.selftest&&typeof spec.selftest==="string"){
  L.push("# ---- additional checks supplied by the tool ----");
  L.push(spec.selftest.replace(/\r/g,""));
  L.push("");
 }
 L.push('if __name__ == "__main__":');
 if(req.length){
  /* §1.4.0: a surviving dependency is announced at run time as well as in the
     header, so it cannot be missed by a reader who skips the docstring. */
  L.push("    print('!! NOT STANDARD-LIBRARY ONLY: this script needed "+req.join(", ").replace(/'/g,"")+"')");
  L.push("    print('!! "+String(pick(spec.requires_reason,l)||"The tool stated no justification for that.").replace(/'/g,"").slice(0,150)+"')");
  L.push('    print("")');
 }
 L.push("    res = compute()");
 L.push("    print("+pyStr(rec.tool.title)+")");
 L.push("    print("+pyStr("Source: "+rec.source)+")");
 L.push("    print("+pyStr("Generated: "+rec.generated_at)+")");
 L.push('    print("")');
 L.push("    for k in EXPECTED:");
 L.push("        v = res.get(k)");
 L.push('        shown = ("%.10g" % v) if isinstance(v, float) else repr(v)');
 L.push("        if 'fmt' in globals():");
 L.push("            try:");
 L.push("                shown = fmt(v)");
 L.push("            except Exception:");
 L.push("                pass");
 L.push("        if len(str(shown)) > 120:");
 L.push("            shown = str(shown)[:117] + '...'");
 L.push("        print('%-24s %18s %s' % (k, shown, UNITS.get(k, '')))");
 L.push("    if NOT_REPRODUCED:");
 L.push('        print("")');
 L.push("        print('Not reproduced by this script (%d): %s' % (len(NOT_REPRODUCED), ', '.join(NOT_REPRODUCED)))");
 L.push('    print("")');
 L.push("    selftest()");
 L.push("    _n = getattr(selftest, 'checked', 0)");
 L.push("    _s = getattr(selftest, 'skipped', [])");
 L.push("    print('self-test passed: %d value(s) reproduce the tool output within %g relative%s%s'");
 L.push("          % (_n, TOLERANCE,");
 L.push("             (', %d not comparable and skipped (%s)' % (len(_s), ', '.join(_s[:6]))) if _s else '',");
 L.push("             (', %d output(s) not reproduced by this script' % len(NOT_REPRODUCED)) if NOT_REPRODUCED else ''))");
 L.push("");
 return{code:L.join("\n"),covers:covered.slice(),not_covered:notCovered.slice(),scoped:scoped};
}

/* ---------- handoff ---------- */
function handoffBuild(){
 if(!CFG.handoff||typeof CFG.handoff.build!=="function")return null;
 const q=safe(CFG.handoff.build,null)();
 if(!q)return null;
 return{schema:HANDOFF_SCHEMA,
  from:{tool:toolId(),file:toolFile(),manifest_revision:toolRev()},
  generated_at:nowISO(),
  quantities:q.quantities||q||{},
  sets:q.sets||{}};
}
function handoffCheck(p){
 const bad=[],unknown=[];
 if(!p||p.schema!==HANDOFF_SCHEMA)return{ok:false,reason:"schema"};
 const scan=o=>{for(const k of Object.keys(o||{})){
   const v=o[k];
   if(!QTY.includes(k))unknown.push(k);
   if(!v||typeof v.value!=="number"||!isFinite(v.value)){bad.push(k+" (value)");continue}
   const u=String(v.unit==null?"":v.unit);
   if(OKUNIT.indexOf(u)<0)bad.push(k+" ("+u+")");
   else if(QUNIT[k]&&QUNIT[k].indexOf(u)<0)bad.push(k+" ("+u+"; expected "+QUNIT[k].join("|")+")");
  }};
 scan(p.quantities);
 for(const s of Object.keys(p.sets||{}))(p.sets[s]||[]).forEach(scan);
 return{ok:bad.length===0,bad:bad,unknown:unknown};
}
function handoffSend(targetFile,payload){
 const p=payload||handoffBuild();
 if(!p){notify(tr("noRecord"),"err");return null}
 const chk=handoffCheck(p);
 if(!chk.ok){notify(tr("hoUnit").replace("%s",(chk.bad||[]).join(", ")),"err");return null}
 const u=targetFile+"?lang="+encodeURIComponent(currentLang())+"&in="+encodeState(p);
 try{window.open(u,"_blank","noopener")}catch(e){location.href=u}
 return u;
}
function handoffReceive(){
 let s=null;try{s=new URLSearchParams(location.search).get("in")}catch(e){}
 if(!s)return null;
 let p;
 try{p=decodeState(s)}catch(e){warn(e);notify(tr("hoBad"),"err");return null}
 const chk=handoffCheck(p);
 if(chk.reason==="schema"){notify(tr("hoBad"),"err");return null}
 if(!chk.ok){notify(tr("hoUnit").replace("%s",(chk.bad||[]).join(", ")),"err");return null}
 const accepts=(manifest()&&manifest().handoff&&manifest().handoff.accepts)||
               (CFG.handoff&&CFG.handoff.accepts)||[];
 const names=Object.keys(p.quantities||{});
 const used=names.filter(n=>accepts.indexOf(n)>=0);
 const ignored=names.filter(n=>accepts.indexOf(n)<0);
 let applied=null;
 if(CFG.handoff&&typeof CFG.handoff.apply==="function")applied=safe(CFG.handoff.apply,null)(p);
 const shown=(applied&&Array.isArray(applied.accepted))?applied.accepted:used;
 const skipped=(applied&&Array.isArray(applied.ignored))?applied.ignored:ignored;
 if(shown.length)notify(tr("hoOk").replace("%f",(p.from&&p.from.tool)||"?").replace("%s",shown.join(", ")),"ok");
 if(skipped.length)notify(tr("hoIgnored").replace("%s",skipped.join(", ")),"warn");
 if(chk.bad&&chk.bad.length)notify(tr("hoUnit").replace("%s",chk.bad.join(", ")),"err");
 return p;
}
/* ---- receiving tools when catalog.php is unreachable (§1.5) ----
   `catalog.php` needs a server; opened from a file:// copy, a USB stick or an
   offline mirror the fetch cannot succeed. Rather than an empty menu the
   runtime falls back to this snapshot of the deployed manifests, labels it as a
   snapshot with its date, and keeps the payload path usable either way.
   Regenerate with:  php catalog.php | jq -c '[.tools[]|select(.handoff.accepts|length>0)|{f:.file,t:.title.en,a:.handoff.accepts}]'
   Titles are English here; the live catalog supplies all six languages. */
const SNAPSHOT_DATE="2026-08-12";
const SNAPSHOT=[
 {f:"doppler.html",t:"Doppler Broadening (U-238)",a:["T"]},
 {f:"spectrum.html",t:"Neutron Flux Spectrum",a:["T"]},
 {f:"kinetics.html",t:"Point Reactor Kinetics",a:["rho_reac"]},
 {f:"steam_tables.html",t:"Steam Tables (IAPWS-IF97)",a:["T","p","v","h","s","u","x"]},
 {f:"mollier.html",t:"Mollier i–d / Psychrometric Chart",a:["T","p","w","mdot","Vdot"]},
 {f:"heat2d.html",t:"2D Heat Transfer",a:["T"]},
 {f:"moodydiagram.html",t:"Moody Diagram & Pipe Friction",a:["T","p","Vdot"]},
 {f:"ventilation.html",t:"Room Ventilation Calculator",a:["Q"]},
 {f:"heat_exchangers.html",t:"Heat Exchanger Calculator",a:["T","p","mdot"]},
 {f:"wallthermalcalculator.html",t:"Wall & Envelope Thermal Calculator",a:["T","p","w"]},
 {f:"cablesizing.html",t:"Cable Sizing",a:["I","L","V_volt"]},
 {f:"hydraulicnetwork.html",t:"Hydraulic Network Solver",a:["rho","D","L"]},
 {f:"ductnetwork.html",t:"Duct Network Solver",a:["rho","D","L"]},
 {f:"waterhammer.html",t:"Water Hammer Transient Sandbox",a:["D","L","rho","Vdot"]},
 {f:"regelkring.html",t:"Control Loop Laboratory",a:["T"]},
 {f:"ontvochtiging.html",t:"Dehumidification Method Selector",a:["T","p","w"]},
 {f:"cfd.html",t:"Voxel CFD — Room & Ventilation Studio",a:["T","w"]}
];
let CATALOG=null,CATALOG_INJECTED=null;
function catalogFetch(){
 if(CATALOG)return CATALOG;
 /* no server behind a file:// copy — do not even try, it only logs a CORS error */
 if(location.protocol==="file:"){CATALOG=Promise.resolve(null);return CATALOG}
 CATALOG=fetch("catalog.php",{cache:"no-cache"}).then(r=>r.ok?r.json():Promise.reject(r.status)).catch(()=>null);
 return CATALOG;
}
function embeddedCatalog(){
 if(CATALOG_INJECTED)return CATALOG_INJECTED;
 try{const el=document.getElementById("diagram-handoff-catalog");
  if(el){const j=JSON.parse(el.textContent);if(Array.isArray(j))CATALOG_INJECTED=j}}catch(e){warn(e)}
 return CATALOG_INJECTED;
}
/* -> {targets:[{file,title,common}], offline:bool, snapshot_date} */
function handoffTargetsInfo(){
 const mine=(manifest()&&manifest().handoff&&manifest().handoff.provides)||
            (CFG.handoff&&CFG.handoff.provides)||[];
 if(!mine.length)return Promise.resolve({targets:[],offline:false});
 const l=currentLang();
 const fromLive=c=>c.tools.filter(t=>t.file!==toolFile()&&t.handoff&&Array.isArray(t.handoff.accepts)
    &&t.handoff.accepts.some(a=>mine.indexOf(a)>=0))
   .map(t=>({file:t.file,title:pick(t.title,l),
             common:t.handoff.accepts.filter(a=>mine.indexOf(a)>=0)}));
 const fromSnap=list=>list.filter(t=>t.f!==toolFile()&&Array.isArray(t.a)&&t.a.some(a=>mine.indexOf(a)>=0))
   .map(t=>({file:t.f,title:t.t||t.f,common:t.a.filter(a=>mine.indexOf(a)>=0)}));
 return catalogFetch().then(c=>{
  if(c&&Array.isArray(c.tools))return{targets:fromLive(c),offline:false};
  const inj=embeddedCatalog();
  if(inj)return{targets:fromSnap(inj),offline:true,snapshot_date:"embedded"};
  return{targets:fromSnap(SNAPSHOT),offline:true,snapshot_date:SNAPSHOT_DATE};
 }).catch(()=>({targets:fromSnap(SNAPSHOT),offline:true,snapshot_date:SNAPSHOT_DATE}));
}
/* Existing signature: resolves to the plain array. The array additionally
   carries .offline / .snapshot_date so a caller can say so. */
function handoffTargets(){
 return handoffTargetsInfo().then(r=>{
  const a=r.targets.slice();
  try{a.offline=!!r.offline;a.snapshot_date=r.snapshot_date||""}catch(e){}
  return a;
 }).catch(()=>[]);
}

/* ---------- UI: toolbar + notifications ---------- */
/* The floating disclaimer badge from site-disclaimer.js lives bottom-right at
   z-index 2147483000. This toolbar is anchored bottom-LEFT below that z-index and
   lifts itself above the badge row on narrow viewports, so the two never overlap. */
function addStyles(){
 if(document.getElementById("dgc-style"))return;
 const s=document.createElement("style");s.id="dgc-style";s.textContent=`
 #dgc-bar{position:fixed;left:14px;bottom:14px;z-index:2147482900;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:min(560px,calc(100vw - 28px));font:600 12px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 #dgc-bar button,#dgc-bar a{font:inherit;border:1px solid #c9d2dd;background:#fff;color:#1d2733;border-radius:999px;padding:7px 11px;cursor:pointer;text-decoration:none;box-shadow:0 2px 10px rgba(0,0,0,.12);white-space:nowrap}
 #dgc-bar button:hover,#dgc-bar a:hover{background:#eef3fa;border-color:#8ea6c8}
 #dgc-bar .dgc-home{background:#1d3f7a;border-color:#1d3f7a;color:#fff}
 #dgc-bar .dgc-status{background:#eaf7ee;border-color:#2e7d32;color:#1b5127}
 #dgc-bar .dgc-status:hover{background:#d8efdf;border-color:#2e7d32}
 #dgc-bar .dgc-status-proto{background:#fff8e6;border-color:#b7791f;color:#593b00}
 #dgc-bar .dgc-status-proto:hover{background:#fdf0d2;border-color:#b7791f}
 #dgc-menu{position:fixed;left:14px;bottom:58px;z-index:2147482950;background:#fff;border:1px solid #c9d2dd;border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.24);padding:8px;max-width:min(420px,calc(100vw - 28px));font:400 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d2733}
 #dgc-menu[hidden]{display:none}
 #dgc-menu button{display:block;width:100%;text-align:left;border:0;background:none;font:inherit;color:inherit;padding:7px 9px;border-radius:8px;cursor:pointer}
 #dgc-menu button:hover{background:#eef3fa}
 #dgc-menu .dgc-q{color:#5c6675;font-size:11px}
 #dgc-notes{position:fixed;left:14px;bottom:58px;z-index:2147482980;display:flex;flex-direction:column;gap:6px;max-width:min(520px,calc(100vw - 28px));font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 #dgc-notes .dgc-note{background:#eef3fa;border:1px solid #b9c9e0;border-left:4px solid #3763e6;color:#16202c;border-radius:10px;padding:9px 30px 9px 11px;position:relative;box-shadow:0 4px 18px rgba(0,0,0,.16);word-break:break-word}
 #dgc-notes .dgc-note.err{background:#fdeeee;border-color:#e2b6b6;border-left-color:#c62828}
 #dgc-notes .dgc-note.warn{background:#fff6e2;border-color:#e6d2a0;border-left-color:#b7791f}
 #dgc-notes .dgc-note.ok{background:#eaf7ee;border-color:#b4dcc1;border-left-color:#2e7d32}
 #dgc-notes .dgc-x{position:absolute;right:5px;top:4px;border:0;background:none;font:700 15px/1 sans-serif;color:inherit;cursor:pointer;padding:3px 6px;opacity:.6}
 #dgc-notes .dgc-x:hover{opacity:1}
 #dgc-notes code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;word-break:break-all;user-select:all;display:block;margin-top:5px;background:#fff;border:1px solid #d5dde7;border-radius:6px;padding:5px 6px}
 @media(max-width:640px){#dgc-bar{bottom:60px}#dgc-menu,#dgc-notes{bottom:104px}}
 @media(prefers-color-scheme:dark){
  #dgc-bar button,#dgc-bar a{background:#161b22;color:#e6edf3;border-color:#30363d}
  #dgc-bar button:hover,#dgc-bar a:hover{background:#22303f}
  #dgc-bar .dgc-home{background:#2f5fb5;border-color:#2f5fb5;color:#fff}
  #dgc-bar .dgc-status{background:#132a19;border-color:#2f6b3d;color:#9fe0b4}
  #dgc-bar .dgc-status:hover{background:#1a3a23}
  #dgc-bar .dgc-status-proto{background:#2b2110;border-color:#8c641c;color:#ffe2a1}
  #dgc-bar .dgc-status-proto:hover{background:#3a2c14}
  #dgc-menu{background:#161b22;color:#e6edf3;border-color:#30363d}
  #dgc-menu button:hover{background:#22303f}
  #dgc-notes .dgc-note{background:#182230;border-color:#2b3b4f;color:#e6edf3}
  #dgc-notes .dgc-note.err{background:#2a1717;border-color:#5a2b2b}
  #dgc-notes .dgc-note.warn{background:#2b2110;border-color:#8c641c}
  #dgc-notes .dgc-note.ok{background:#132a19;border-color:#2f6b3d}
  #dgc-notes code{background:#0d1117;border-color:#30363d}}
 @media print{#dgc-bar,#dgc-menu,#dgc-notes,#dgc-report-frame{display:none!important}}
 `;
 (document.head||document.documentElement).appendChild(s);
}
function notesBox(){
 let n=document.getElementById("dgc-notes");
 if(!n){n=document.createElement("div");n.id="dgc-notes";document.body.appendChild(n)}
 return n;
}
function notify(msg,kind,code){
 try{
  addStyles();
  const box=notesBox(),d=document.createElement("div");
  d.className="dgc-note"+(kind?" "+kind:"");
  d.setAttribute("role",kind==="err"?"alert":"status");
  d.innerHTML="<span>"+esc(msg)+"</span>"+(code?"<code>"+esc(code)+"</code>":"")
   +'<button class="dgc-x" type="button" aria-label="'+esc(tr("close"))+'">×</button>';
  d.querySelector(".dgc-x").addEventListener("click",()=>d.remove());
  box.appendChild(d);
  if(kind==="ok")setTimeout(()=>d.remove(),8000);
  return d;
 }catch(e){warn(e);return null}
}
function menu(items,anchorText,note){
 let m=document.getElementById("dgc-menu");
 if(m)m.remove();
 m=document.createElement("div");m.id="dgc-menu";
 m.innerHTML=(note?'<div class="dgc-q dgc-note-line" style="padding:7px 9px">'+esc(note)+"</div>":"")
  +(items.length?"":'<div class="dgc-q" style="padding:7px 9px">'+esc(anchorText)+"</div>");
 items.forEach(it=>{
  const b=document.createElement("button");b.type="button";
  b.innerHTML=esc(it.label)+(it.sub?'<div class="dgc-q">'+esc(it.sub)+"</div>":"");
  b.addEventListener("click",()=>{m.remove();safe(it.on,null)()});
  m.appendChild(b);
 });
 document.body.appendChild(m);
 setTimeout(()=>{document.addEventListener("click",function h(e){
  if(!m.contains(e.target)){m.remove();document.removeEventListener("click",h)}},{once:false})},0);
 return m;
}
function fileName(ext){return toolId()+"-"+stamp()+"."+ext}
function withRecord(fn){
 const rec=recordBuild();
 if(!rec){notify(tr("noRecord"),"err");return}
 fn(rec);
}
function buildBar(){
 addStyles();
 let bar=document.getElementById("dgc-bar");
 if(!bar){bar=document.createElement("div");bar.id="dgc-bar";bar.setAttribute("role","group");document.body.appendChild(bar)}
 bar.innerHTML="";
 const l=currentLang();
 const add=(label,on,cls)=>{const b=document.createElement("button");b.type="button";b.textContent=label;
  if(cls)b.className=cls;b.addEventListener("click",safe(on,null));bar.appendChild(b);return b};
 const home=document.createElement("a");home.className="dgc-home";home.href="index.html?lang="+l;
 home.textContent=tr("tools",l);bar.appendChild(home);
 /* In-tool status badge: the real status, and a link to the benchmark report
    when there is an artifact behind the claim. */
 if(hasReport()){
  const st=shownStatus(),tally=benchTally();
  const a=document.createElement("a");
  a.className="dgc-status"+(st==="prototype"?" dgc-status-proto":"");
  a.href="benchmark.html?tool="+encodeURIComponent(toolId())+"&lang="+encodeURIComponent(l);
  const w=statusWord(l);
  a.textContent=w.charAt(0).toUpperCase()+w.slice(1)+(tally.cases?" · "+tally.passed+"/"+tally.cases:"");
  a.title=tr("rReport",l);
  bar.appendChild(a);
 }
 if(CFG.state&&typeof CFG.state.serialize==="function")add(tr("copyLink",l),()=>{
  const u=stateLink();
  const kb=Math.round(u.length/102.4)/10;
  const done=()=>{notify(tr("linkCopied",l),"ok");
   if(u.length>4096)notify(tr("linkLong",l).replace("%n",kb),"warn")};
  try{navigator.clipboard.writeText(u).then(done,()=>notify(tr("linkHere",l),null,u))}
  catch(e){notify(tr("linkHere",l),null,u)}
 });
 if(CFG.record){
  add(tr("report",l),()=>{withRecord(rec=>report({record:rec}))});
  add(tr("json",l),()=>{withRecord(rec=>download(fileName("json"),"application/json",JSON.stringify(rec,null,1)))});
  add(tr("csv",l),()=>{withRecord(rec=>download(fileName("csv"),"text/csv",recordCSV(rec)))});
 }
 const m=manifest(),pe=(m&&m.python_export)||null;
 if(CFG.python&&(!pe||pe.supported!==false))add(tr("py",l),()=>{
  const r=pythonEmit();
  /* A provider that declines *this state* gets its own reason and its own
     wording — it is not a broken export, it is an honest refusal (§1.4). */
  if(r.error){notify(tr(r.unsupported?"pyState":"pyOff",l).replace("%s",r.error),r.unsupported?"warn":"err");return}
  download(toolId().replace(/-/g,"_")+"_"+stamp()+".py","text/x-python",r.code);
 });
 const prov=(m&&m.handoff&&m.handoff.provides)||(CFG.handoff&&CFG.handoff.provides)||[];
 if(CFG.handoff&&typeof CFG.handoff.build==="function"&&prov.length)add(tr("sendTo",l),()=>{
  handoffTargetsInfo().then(r=>{
   const items=r.targets.map(t=>({label:t.title,sub:t.common.join(", "),on:()=>handoffSend(t.file)}));
   let note="";
   if(r.offline){
    note=r.targets.length?tr("hoOffline",l).replace("%s",r.snapshot_date||"—"):tr("hoOfflineNone",l);
    /* the payload path stays open whether or not the catalogue could be read */
    items.push({label:tr("hoCopy",l),sub:prov.join(", "),on:()=>{
     const p=handoffBuild();
     if(!p){notify(tr("noRecord",l),"err");return}
     const s=JSON.stringify(p,null,1);
     try{navigator.clipboard.writeText(s).then(()=>notify(tr("hoCopied",l),"ok"),
       ()=>notify(tr("hoCopied",l).replace(/\.$/,":"),null,s))}
     catch(e){notify(tr("hoCopied",l).replace(/\.$/,":"),null,s)}
    }});
   }
   menu(items,tr("noTargets",l),note);
  });
 });
}
function sectionsFor(rec){
 if(CFG.report&&typeof CFG.report.sections==="function")
  return safe(CFG.report.sections,[])(rec)||[];
 return [];
}

/* ---------- <html lang> observer ----------
   Two framework scripts and often the tool itself watch this attribute. A tool
   that assigns documentElement.lang unconditionally — even the same value —
   wakes every observer, and if any of them writes it back the page live-locks.
   The guard is: a mutation that did not change the value is not a change.
   A runaway sequence of real changes disconnects the observer instead of
   hanging the page, and says so once in the console. */
function watchDocLang(onChange){
 let last=base(document.documentElement.lang),hits=0,t0=0,obs=null;
 try{
  obs=new MutationObserver(()=>{
   const nl=base(document.documentElement.lang);
   if(nl===last)return;                       /* unchanged: ignore */
   last=nl;
   const now=Date.now();
   if(now-t0>2000){t0=now;hits=0}
   if(++hits>40){warn("<html lang> changed "+hits+" times in 2 s — observer disconnected");
    try{obs.disconnect()}catch(e){}return}
   try{onChange(nl)}catch(e){warn(e)}
  });
  obs.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
 }catch(e){warn(e)}
 return obs;
}
/* Write <html lang> only when it really changes — the safe way for a tool to
   publish its language without waking the observers for nothing. */
function setDocLang(l){
 const v=String(l||"");
 try{if(base(document.documentElement.lang)!==base(v))document.documentElement.lang=v}catch(e){warn(e)}
 return document.documentElement.lang;
}

/* ---------- readiness ----------
   Boot is synchronous, but a tool may only have its first result after a
   worker, a fetch or a simulation. `Diagram.ready(promise)` registers such a
   gate; `Diagram.whenReady()` resolves once boot and every gate has settled and
   sets window.__diagramReady, which is what an automated check should wait for
   instead of guessing a delay. */
const GATES=[];
let bootResolve=null;
const bootPromise=new Promise(r=>{bootResolve=r});
function ready(x){
 if(x===undefined||x===null){GATES.push(Promise.resolve(true));return API}
 let p=x;
 if(typeof p==="function"){try{p=p()}catch(e){warn(e);p=null}}
 if(p&&typeof p.then==="function")GATES.push(Promise.resolve(p).catch(()=>null));
 return API;
}
function whenReady(timeout){
 const t0=Date.now(),lim=typeof timeout==="number"?timeout:15000;
 const step=()=>{
  const n=GATES.length;
  return bootPromise
   .then(()=>Promise.all(GATES.slice().map(p=>Promise.resolve(p).catch(()=>null))))
   .then(()=>{
    if(GATES.length!==n&&Date.now()-t0<lim)return step();
    try{window.__diagramReady=true}catch(e){}
    return true;
   });
 };
 return step().catch(()=>{try{window.__diagramReady=true}catch(e){}return true});
}

/* ---------- init ---------- */
function init(cfg){
 try{
  cfg=cfg||{};
  Object.assign(CFG,cfg);
  if(started)return API;
  started=true;
  const boot=()=>{try{
   fixDocTitle();
   buildBar();
   readIncomingState();
   handoffReceive();
   watchDocLang(nl=>{if(LANGS.includes(nl)&&nl!==currentLang()){langOverride=nl;buildBar()}});
  }catch(e){warn(e)}
  try{if(bootResolve)bootResolve(true)}catch(e){}
  try{whenReady()}catch(e){warn(e)}};
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
  else boot();
 }catch(e){warn(e)}
 return API;
}
/* A page that never calls init() still reaches readiness, so a checker can wait
   on the same signal everywhere. */
try{
 const b=()=>{try{fixDocTitle()}catch(e){}
  try{if(bootResolve)bootResolve(true);if(!started)whenReady()}catch(e){}};
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(b,0));
 else setTimeout(b,0);
}catch(e){}

const API={
 version:VERSION,
 langs:LANGS.slice(),
 quantities:QTY.slice(),
 init:init,
 ready:ready,
 whenReady:whenReady,
 lang:currentLang,
 setLang(l){if(LANGS.includes(base(l))){langOverride=base(l);try{buildBar()}catch(e){}}return currentLang()},
 setDocumentLang:setDocLang,
 watchLang:watchDocLang,
 manifest:manifest,
 site:{base:siteBase,name:siteName,isLocal:siteIsLocal,sourceRef:siteSourceRef,fixTitle:fixDocTitle},
 notify:notify,
 state:{encode:encodeState,decode:decodeState,link:stateLink,current:serializeState},
 record:{build:recordBuild,schema:RECORD_SCHEMA},
 export:{
  json(){const r=recordBuild();if(!r){notify(tr("noRecord"),"err");return null}
   const s=JSON.stringify(r,null,1);download(fileName("json"),"application/json",s);return s},
  csv(){const r=recordBuild();if(!r){notify(tr("noRecord"),"err");return null}
   const s=recordCSV(r);download(fileName("csv"),"text/csv",s);return s},
  download:download
 },
 report:report,
 python:{emit(){const r=pythonEmit();return r.error?null:r.code},
  info:pythonEmit,
  download(){const r=pythonEmit();
   if(r.error){notify(tr(r.unsupported?"pyState":"pyOff").replace("%s",r.error),r.unsupported?"warn":"err");return null}
   download(toolId().replace(/-/g,"_")+"_"+stamp()+".py","text/x-python",r.code);return r.code}},
 handoff:{schema:HANDOFF_SCHEMA,build:handoffBuild,send:handoffSend,receive:handoffReceive,
  check:handoffCheck,targets:handoffTargets,targetsInfo:handoffTargetsInfo,
  setCatalog(list){CATALOG_INJECTED=Array.isArray(list)?list.slice():null;return CATALOG_INJECTED}},
 toolbar:{refresh(){try{buildBar()}catch(e){warn(e)}}},
 _codec:{deflateRaw,inflateRaw,b64u,unb64u}
};
window.Diagram=API;
})();
