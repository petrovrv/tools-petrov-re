/* tools.petrov.re — shared tool runtime (framework v2).
   Single global: window.Diagram. No build step, no external dependencies, no network.
   Inert until a tool calls Diagram.init(). Never throws into tool code. */
(()=>{
"use strict";
if(window.Diagram)return;
const VERSION="2026-09-26.v4.18-permalink-trailer";
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
 linkCopied:{en:"Permalink copied to the clipboard.",uk:"Постійне посилання скопійовано.",de:"Permalink in die Zwischenablage kopiert.",nl:"Permalink naar het klembord gekopieerd.",fr:"Lien permanent copié dans le presse-papiers.",es:"Enlace permanente copiado al portapapeles.",pl:"Link trwały skopiowany do schowka."},
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
 rTitle:{en:"Technical calculation report",uk:"Технічний розрахунковий звіт",de:"Technischer Berechnungsbericht",nl:"Technisch berekeningsrapport",fr:"Rapport de calcul technique",es:"Informe técnico de cálculo",pl:"Techniczny raport obliczeniowy"},
 rGen:{en:"Generated",uk:"Створено",de:"Erstellt",nl:"Gegenereerd",fr:"Généré le",es:"Generado",pl:"Wygenerowano"},
 rSource:{en:"Source",uk:"Джерело",de:"Quelle",nl:"Bron",fr:"Source",es:"Fuente",pl:"Źródło"},
 rStatus:{en:"Status",uk:"Статус",de:"Status",nl:"Status",fr:"Statut",es:"Estado",pl:"Status"},
 rRevision:{en:"Revision",uk:"Редакція",de:"Revision",nl:"Revisie",fr:"Révision",es:"Revisión",pl:"Rewizja"},
 rPerma:{en:"Permalink (reopens this exact state)",uk:"Постійне посилання (відкриває саме цей стан)",de:"Permalink (öffnet genau diesen Zustand)",nl:"Permalink (opent exact deze toestand)",fr:"Lien permanent (rouvre exactement cet état)",es:"Enlace permanente (reabre exactamente este estado)",pl:"Link trwały (ponownie otwiera ten sam stan)"},
 rPermaNone:{en:"Address (no encoded state)",uk:"Адреса (стан не закодовано)",de:"Adresse (kein kodierter Zustand)",nl:"Adres (geen gecodeerde toestand)",fr:"Adresse (aucun état encodé)",es:"Dirección (sin estado codificado)",pl:"Adres (bez zakodowanego stanu)"},
 rPermaBare:{en:"Permalink",uk:"Постійне посилання",de:"Permalink",nl:"Permalink",fr:"Lien permanent",es:"Enlace permanente",pl:"Link trwały"},
 rStateFp:{en:"State fingerprint",uk:"Відбиток стану",de:"Zustands-Fingerprint",nl:"Vingerafdruk toestand",fr:"Empreinte de l'état",es:"Huella del estado",pl:"Odcisk stanu"},
 rStateLen:{en:"Encoded state",uk:"Закодований стан",de:"Kodierter Zustand",nl:"Gecodeerde toestand",fr:"État encodé",es:"Estado codificado",pl:"Zakodowany stan"},
 rChars:{en:"%n characters",uk:"%n знаків",de:"%n Zeichen",nl:"%n tekens",fr:"%n caractères",es:"%n caracteres",pl:"%n znaków"},
 rChars1:{en:"%n character",uk:"%n знак",de:"%n Zeichen",nl:"%n teken",fr:"%n caractère",es:"%n carácter",pl:"%n znak"},
 rChars2:{uk:"%n знаки",pl:"%n znaki"},
 rPermaEnd:{en:"The full permalink is printed at the end of this document.",uk:"Повне постійне посилання наведено в кінці документа.",de:"Der vollständige Permalink steht am Ende dieses Dokuments.",nl:"De volledige permalink staat aan het einde van dit document.",fr:"Le lien permanent complet figure à la fin de ce document.",es:"El enlace permanente completo figura al final de este documento.",pl:"Pełny link trwały znajduje się na końcu tego dokumentu."},
 rPermaTrailer:{en:"Permalink, in full",uk:"Постійне посилання повністю",de:"Permalink, vollständig",nl:"Permalink, volledig",fr:"Lien permanent, en entier",es:"Enlace permanente, completo",pl:"Link trwały, w całości"},
 rEvidLang:{en:"Marked [xx]: the manifest supplies this text in that language only.",uk:"Позначено [xx]: маніфест подає цей текст лише цією мовою.",de:"Mit [xx] markiert: Das Manifest liefert diesen Text nur in dieser Sprache.",nl:"Gemarkeerd met [xx]: het manifest levert deze tekst alleen in die taal.",fr:"Marqué [xx] : le manifeste ne fournit ce texte que dans cette langue.",es:"Marcado [xx]: el manifiesto solo facilita este texto en ese idioma.",pl:"Oznaczone [xx]: manifest podaje ten tekst tylko w tym języku."},
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
 rBenchId:{en:"Benchmark identifier",uk:"Ідентифікатор бенчмарку",de:"Benchmark-Kennung",nl:"Benchmark-identificatie",fr:"Identifiant de la référence de validation",es:"Identificador del banco de pruebas",pl:"Identyfikator benchmarku"},
 rTol:{en:"Tolerance",uk:"Допуск",de:"Toleranz",nl:"Tolerantie",fr:"Tolérance",es:"Tolerancia",pl:"Tolerancja"},
 rRef:{en:"Reference",uk:"Еталон",de:"Referenz",nl:"Referentie",fr:"Référence",es:"Referencia",pl:"Odniesienie"},
 rArtifact:{en:"Artifact",uk:"Артефакт",de:"Artefakt",nl:"Artefact",fr:"Artefact",es:"Artefacto",pl:"Artefakt"},
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
 rReport:{en:"Benchmark report",uk:"Звіт про бенчмарк",de:"Benchmark-Bericht",nl:"Benchmarkrapport",fr:"Rapport de banc d'essai",es:"Informe del banco de pruebas",pl:"Raport z benchmarku"},
 rExecutive:{en:"Executive summary",uk:"Резюме",de:"Zusammenfassung",nl:"Samenvatting",fr:"Synthèse",es:"Resumen ejecutivo",pl:"Podsumowanie"},
 rPurpose:{en:"Purpose and scope",uk:"Мета та межі",de:"Zweck und Umfang",nl:"Doel en reikwijdte",fr:"Objet et périmètre",es:"Objeto y alcance",pl:"Cel i zakres"},
 rBasis:{en:"Design basis and assumptions",uk:"Вихідні дані та припущення",de:"Auslegungsgrundlage und Annahmen",nl:"Ontwerpgrondslag en aannames",fr:"Base de conception et hypothèses",es:"Base de diseño e hipótesis",pl:"Podstawa projektowa i założenia"},
 rSystem:{en:"System and model description",uk:"Опис системи та моделі",de:"System- und Modellbeschreibung",nl:"Systeem- en modelbeschrijving",fr:"Description du système et du modèle",es:"Descripción del sistema y del modelo",pl:"Opis systemu i modelu"},
 rDecisions:{en:"Selections and rationale",uk:"Вибір та обґрунтування",de:"Auswahl und Begründung",nl:"Keuzes en onderbouwing",fr:"Choix et justification",es:"Selecciones y justificación",pl:"Dobór i uzasadnienie"},
 rChecks:{en:"Verification and checks",uk:"Перевірка та контроль",de:"Nachweise und Prüfungen",nl:"Verificatie en controles",fr:"Vérifications et contrôles",es:"Verificación y comprobaciones",pl:"Weryfikacja i kontrole"},
 rRisks:{en:"Risks and required actions",uk:"Ризики та необхідні дії",de:"Risiken und erforderliche Maßnahmen",nl:"Risico's en vereiste acties",fr:"Risques et actions requises",es:"Riesgos y acciones requeridas",pl:"Ryzyka i wymagane działania"},
 rMethod:{en:"Calculation method and references",uk:"Методика розрахунку та джерела",de:"Berechnungsmethode und Quellen",nl:"Berekeningsmethode en bronnen",fr:"Méthode de calcul et références",es:"Método de cálculo y referencias",pl:"Metoda obliczeń i źródła"},
 rTrace:{en:"Traceability",uk:"Простежуваність",de:"Rückverfolgbarkeit",nl:"Traceerbaarheid",fr:"Traçabilité",es:"Trazabilidad",pl:"Identyfikowalność"},
 rIntended:{en:"Intended use",uk:"Призначення",de:"Vorgesehene Verwendung",nl:"Beoogd gebruik",fr:"Utilisation prévue",es:"Uso previsto",pl:"Przeznaczenie"},
 rDescription:{en:"Description",uk:"Опис",de:"Beschreibung",nl:"Beschrijving",fr:"Description",es:"Descripción",pl:"Opis"},
 rConclusion:{en:"Conclusion",uk:"Висновок",de:"Fazit",nl:"Conclusie",fr:"Conclusion",es:"Conclusión",pl:"Wniosek"},
 rSelection:{en:"Selection",uk:"Вибір",de:"Auswahl",nl:"Keuze",fr:"Choix",es:"Selección",pl:"Dobór"},
 rReason:{en:"Rationale",uk:"Обґрунтування",de:"Begründung",nl:"Onderbouwing",fr:"Justification",es:"Justificación",pl:"Uzasadnienie"},
 rDriver:{en:"Governing data",uk:"Визначальні дані",de:"Bestimmende Daten",nl:"Bepalende gegevens",fr:"Données déterminantes",es:"Datos determinantes",pl:"Dane miarodajne"},
 rBasisCol:{en:"Basis",uk:"Підстава",de:"Grundlage",nl:"Grondslag",fr:"Base",es:"Base",pl:"Podstawa"},
 rOutcome:{en:"Outcome",uk:"Результат",de:"Ergebnis",nl:"Uitkomst",fr:"Résultat",es:"Resultado",pl:"Wynik"},
 rActual:{en:"Actual",uk:"Фактично",de:"Istwert",nl:"Werkelijk",fr:"Valeur obtenue",es:"Valor obtenido",pl:"Wartość rzeczywista"},
 rCriterion:{en:"Criterion",uk:"Критерій",de:"Kriterium",nl:"Criterium",fr:"Critère",es:"Criterio",pl:"Kryterium"},
 rAction:{en:"Required action",uk:"Необхідна дія",de:"Erforderliche Maßnahme",nl:"Vereiste actie",fr:"Action requise",es:"Acción requerida",pl:"Wymagane działanie"},
 rPass:{en:"Pass",uk:"Виконано",de:"Erfüllt",nl:"Voldoet",fr:"Conforme",es:"Cumple",pl:"Spełniono"},
 rAttention:{en:"Attention",uk:"Увага",de:"Beachten",nl:"Aandacht",fr:"Attention",es:"Atención",pl:"Uwaga"},
 rFail:{en:"Not satisfied",uk:"Не виконано",de:"Nicht erfüllt",nl:"Niet voldaan",fr:"Non conforme",es:"No cumple",pl:"Niespełnione"},
 rInfo:{en:"Information",uk:"Інформація",de:"Information",nl:"Informatie",fr:"Information",es:"Información",pl:"Informacja"},
 rReferences:{en:"References",uk:"Джерела",de:"Quellen",nl:"Bronnen",fr:"Références",es:"Referencias",pl:"Źródła"},
 rSeries:{en:"%n values, %a to %b",uk:"%n значень, від %a до %b",de:"%n Werte, %a bis %b",nl:"%n waarden, %a tot %b",fr:"%n valeurs, de %a à %b",es:"%n valores, de %a a %b",pl:"%n wartości, od %a do %b"},
 rSeriesTable:{en:"Detail per item is in the tool's own tables below.",uk:"Подробиці за кожним елементом — у власних таблицях інструмента нижче.",de:"Die Einzelwerte stehen in den Tabellen des Werkzeugs weiter unten.",nl:"De waarden per element staan in de eigen tabellen van de tool hieronder.",fr:"Le détail par élément figure dans les tableaux de l'outil ci-dessous.",es:"El detalle por elemento está en las tablas propias de la herramienta más abajo.",pl:"Wartości dla poszczególnych elementów są w tabelach narzędzia poniżej."},
 rFigures:{en:"Figures",uk:"Рисунки",de:"Abbildungen",nl:"Figuren",fr:"Figures",es:"Figuras",pl:"Rysunki"},
 rQuestions:{en:"Open questions for the supplier",uk:"Відкриті питання до постачальника",de:"Offene Fragen an den Lieferanten",nl:"Openstaande vragen aan de leverancier",fr:"Questions ouvertes au fournisseur",es:"Preguntas abiertas al proveedor",pl:"Pytania otwarte do dostawcy"},
 rAppendixInputs:{en:"Appendix A — detailed inputs",uk:"Додаток A — детальні вхідні дані",de:"Anhang A — detaillierte Eingaben",nl:"Bijlage A — gedetailleerde invoer",fr:"Annexe A — données d'entrée détaillées",es:"Anexo A — entradas detalladas",pl:"Załącznik A — szczegółowe dane wejściowe"},
 rAppendixTrace:{en:"Appendix B — traceability",uk:"Додаток B — простежуваність",de:"Anhang B — Rückverfolgbarkeit",nl:"Bijlage B — traceerbaarheid",fr:"Annexe B — traçabilité",es:"Anexo B — trazabilidad",pl:"Załącznik B — identyfikowalność"},
 rAutoSummaryOk:{en:"The calculation completed for the recorded state. No tool-generated warning was returned; this does not constitute independent verification.",uk:"Розрахунок виконано для зафіксованого стану. Інструмент не видав попереджень; це не є незалежною перевіркою.",de:"Die Berechnung wurde für den dokumentierten Zustand abgeschlossen. Das Werkzeug gab keine Warnung aus; dies ist keine unabhängige Prüfung.",nl:"De berekening is voor de vastgelegde toestand voltooid. De tool gaf geen waarschuwing; dit is geen onafhankelijke verificatie.",fr:"Le calcul a été effectué pour l'état consigné. L'outil n'a émis aucun avertissement ; cela ne constitue pas une vérification indépendante.",es:"El cálculo se completó para el estado registrado. La herramienta no emitió advertencias; esto no constituye una verificación independiente.",pl:"Obliczenie wykonano dla zapisanego stanu. Narzędzie nie zgłosiło ostrzeżeń; nie stanowi to niezależnej weryfikacji."},
 rAutoSummaryWarn:{en:"The calculation completed with %n item(s) requiring review before the result is used.",uk:"Розрахунок виконано з %n пунктами, які слід перевірити перед використанням результату.",de:"Die Berechnung wurde mit %n Punkt(en) abgeschlossen, die vor Verwendung des Ergebnisses zu prüfen sind.",nl:"De berekening is voltooid met %n punt(en) die vóór gebruik van het resultaat moeten worden beoordeeld.",fr:"Le calcul est terminé avec %n point(s) à examiner avant utilisation du résultat.",es:"El cálculo finalizó con %n punto(s) que deben revisarse antes de usar el resultado.",pl:"Obliczenie zakończono z %n punktem/punktami wymagającymi przeglądu przed użyciem wyniku."},
 rNoChecks:{en:"No explicit acceptance checks were supplied for this state. Review the result against the project criteria and cited method.",uk:"Для цього стану не задано явних критеріїв приймання. Перевірте результат за критеріями проєкту та наведеною методикою.",de:"Für diesen Zustand wurden keine ausdrücklichen Abnahmekriterien angegeben. Das Ergebnis ist anhand der Projektkriterien und der genannten Methode zu prüfen.",nl:"Voor deze toestand zijn geen expliciete acceptatiecriteria opgegeven. Toets het resultaat aan de projectcriteria en de vermelde methode.",fr:"Aucun critère d'acceptation explicite n'a été fourni pour cet état. Vérifiez le résultat selon les critères du projet et la méthode citée.",es:"No se proporcionaron criterios de aceptación explícitos para este estado. Revise el resultado según los criterios del proyecto y el método citado.",pl:"Dla tego stanu nie podano jawnych kryteriów akceptacji. Wynik należy sprawdzić względem kryteriów projektu i wskazanej metody."}
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
function statusWord(l,status){return tr({prototype:"stPrototype",benchmarked:"stBenchmarked",verified:"stVerified"}[status||shownStatus()]||"stPrototype",l)}
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

/* ---------- state fingerprint ----------
   The permalink carries the whole tool state inside its `s=` parameter, so on
   a printed sheet it runs to thousands of characters. What the sheet prints
   instead of a long address is a fingerprint, and the fingerprint has to be
   reproducible by hand and identical on the page and on the paper.

   THE BYTES HASHED ARE EXACTLY THE `s=` PARAMETER VALUE AS IT STANDS IN THE
   ADDRESS: the output of encodeState(), that is the tag letter `D` (deflate)
   or `J` (plain) followed by base64url, with no percent-escaping -- base64url
   uses only A-Za-z0-9-_ and is never escaped by stateLink(). Those characters
   are ASCII, so the UTF-8 encoding below is byte-for-byte the characters a
   reader sees. A reader with the link can reproduce the value:

     printf '%s' '<everything after s= up to & or #>' | sha256sum | cut -c1-8

   sha256 is implemented here rather than taken from crypto.subtle because
   crypto.subtle.digest() returns a Promise and is absent on an insecure
   origin, while the report is laid out synchronously and the record is built
   synchronously. 8 hex digits = 32 bits: it tells a reader whether the page in
   front of them carries the state the sheet was printed from, and it is not a
   signature. */
const shaRotr=(x,n)=>((x>>>n)|(x<<(32-n)))>>>0;
const SHA_K=new Uint32Array([
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
function sha256hex(bytes){
 const ml=bytes.length,blocks=Math.ceil((ml+9)/64),buf=new Uint8Array(blocks*64);
 buf.set(bytes);buf[ml]=0x80;
 const dv=new DataView(buf.buffer),bits=ml*8;
 dv.setUint32(blocks*64-8,Math.floor(bits/4294967296));
 dv.setUint32(blocks*64-4,bits>>>0);
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
                          0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const w=new Uint32Array(64);
 for(let i=0;i<blocks;i++){
  const o=i*64;
  for(let t=0;t<16;t++)w[t]=dv.getUint32(o+t*4);
  for(let t=16;t<64;t++){
   const x=w[t-15],y=w[t-2];
   const s0=shaRotr(x,7)^shaRotr(x,18)^(x>>>3);
   const s1=shaRotr(y,17)^shaRotr(y,19)^(y>>>10);
   w[t]=(w[t-16]+s0+w[t-7]+s1)>>>0;
  }
  let a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],f=h[5],g=h[6],hh=h[7];
  for(let t=0;t<64;t++){
   const S1=shaRotr(e,6)^shaRotr(e,11)^shaRotr(e,25);
   const t1=(hh+S1+((e&f)^(~e&g))+SHA_K[t]+w[t])>>>0;
   const S0=shaRotr(a,2)^shaRotr(a,13)^shaRotr(a,22);
   const t2=(S0+((a&b)^(a&c)^(b&c)))>>>0;
   hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;
  h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+hh)>>>0;
 }
 let out="";
 for(let i=0;i<8;i++)out+=("0000000"+h[i].toString(16)).slice(-8);
 return out;
}
/* The `s=` value of a permalink, or "" when the address carries no state. The
   record is the source: a report rendered from a saved record has to produce
   the fingerprint of the state that record was saved with, not of whatever the
   page holds now. */
function statePayload(u){
 const m=/[?&]s=([^&#]*)/.exec(String(u==null?"":u));
 return m?m[1]:"";
}
/* The address with the `s=` payload removed. API only (Diagram.state.address):
   a tool that wants to show a reader which part of its permalink is the address
   and which part is the state needs the split, and doing it in the tool means
   doing it seven times. The printed sheet does not use it -- see the trailer. */
function permaAddress(u){
 const s=String(u==null?"":u).split("#")[0],q=s.indexOf("?");
 if(q<0)return s;
 const keep=s.slice(q+1).split("&").filter(p=>!/^s=/.test(p));
 return s.slice(0,q)+(keep.length?"?"+keep.join("&"):"");
}
/* 8 hex of the sha256 of the `s=` payload. No state, no fingerprint. */
function stateFingerprint(u){
 const s=statePayload(u===undefined?stateLink():u);
 if(!s)return "";
 try{return sha256hex(new TextEncoder().encode(s)).slice(0,8)}catch(e){warn(e);return ""}
}
/* One rendering of the fingerprint, used by the printed sheet and by the
   page's own "Copy link" notice, so the two cannot drift apart: the algorithm
   travels with the value instead of widening the label column. */
function fpText(fp){return fp?"sha256:"+fp:""}
/* Count agreement. Form 0 is the plural, form 1 the singular, form 2 the
   Slavic 2-4 form. en, de, nl, fr and es take the singular at a count of
   exactly 1 and the plural at every other count, so 1851 is "1851 characters"
   and "1851 tekens".

   uk and pl do not share one rule, and reading pl by the Ukrainian rule is the
   defect this function was written twice for. Ukrainian reads the last two
   digits: the 1-form for a count ending in 1 outside 11-14 (1851 знак), the
   2-4 form for a count ending in 2-4 outside 12-14 (163 знаки), the plural
   elsewhere (3868 знаків). Polish takes the singular at exactly 1 only
   (1 znak); 21, 101, 151 and 2181 take the plural (2181 znaków), and the 2-4
   form follows the same last-two-digit rule as Ukrainian (163 znaki).
   9 of every 100 lengths end in 1 outside 11-14, which is how often the two
   rules disagree. */
function countForm(n,l){
 const x=Math.abs(n);
 if(l!=="uk"&&l!=="pl")return x===1?1:0;
 const a=x%100,b=a%10;
 if(a>=11&&a<=14)return 0;
 if(b===1)return l==="uk"?1:(x===1?1:0);
 if(b>=2&&b<=4)return 2;
 return 0;
}
function charsText(n,l){
 const f=countForm(n,l),k=f===1?"rChars1":(f===2?"rChars2":"rChars");
 return (tr(k,l)||tr("rChars",l)).replace("%n",reportNumber(n,l));
}
/* A permalink at or below this many characters prints in full on page one.
   Measured at the report's body width: 200 characters is 3 printed lines of
   the 7,8 px monospace run, against 20 lines for 1 600 characters. Below the
   threshold the trailer block is not emitted and page one carries the address
   itself, so no reader is sent to the end of the document for 3 lines. */
const PERMA_INLINE_MAX=200;
/* The address is printed in segments of at most this many characters. One item
   the pager places is clipped at the bottom edge of the page body by
   .pc{overflow:hidden}, with no mark on the sheet, and the printed address then
   reopens nothing. The monospace run measures 0,0803 px per character at
   7,8 px/1,4 in the 178 mm text column, so the 971 px page body holds about
   11 900 characters of address; 8 000 characters measure 657 px, which fits
   the body whatever else the pager has already put on the page. A
   40 000-character address therefore prints in 6 segments over 4 pages instead
   of losing four fifths of itself. Each segment is a contiguous slice of the
   address and is numbered k/m, so a reader glues the printed segments back in
   order. Measured in checks/long.mjs. */
const PERMA_SEG_MAX=8000;

/* ---------- calculation record ---------- */
function nowISO(){return new Date().toISOString().replace(/\.\d{3}Z$/,"Z")}
function stamp(){return nowISO().replace(/[-:]/g,"").replace(/Z$/,"Z")}
function recordBuild(){
 const l=currentLang();
 const r=(CFG.record?safe(CFG.record,null)():null)||null;
 if(!r)return null;
 const pl=stateLink();
 return{
  schema:RECORD_SCHEMA,
  tool:{id:toolId(),file:toolFile(),title:toolTitle(l),manifest_revision:toolRev(),
        status:toolStatus(),independent_validation:toolIndep()},
  generated_at:nowISO(),
  source:siteSourceRef(l),
  permalink:pl,
  /* The fingerprint of the `s=` payload of that permalink, so a saved record
     reproduces on paper the fingerprint of the state it was saved with. */
  state_fingerprint:stateFingerprint(pl),
  inputs:r.inputs||{},outputs:r.outputs||{},units:r.units||{},
  /* Optional, JSON-safe domain data needed to explain a calculation.  It is
     part of the saved record so a report rendered later cannot silently lose
     the selected mode, machine basis or another report-critical choice. */
  report_context:(r.report_context&&typeof r.report_context==="object")?r.report_context:
    {mode:r.mode||"",machine:(r.machine&&typeof r.machine==="object")?r.machine:{}},
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
  ["generated_at",rec.generated_at,""],["source",rec.source,""],["permalink",rec.permalink,""],
  ["state_fingerprint",rec.state_fingerprint||"",""]);
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
/* Manifest evidence text -- a benchmark reference, its citations, its
   tolerance -- is either a localized object, as the rest of the manifest is,
   or a plain string, which is all the v2 schema types those three fields as.
   A localized object is printed in the report language. A plain string
   carries no language declaration and is printed with the language it is
   actually written in: over the site registry (AGENTS §0) only `uk` is
   non-Latin, so the script attributes it completely. The tag rides on the
   row label and never on the text, so the sentence a reader (or the QA
   duplicate scan) compares with another report is left exactly as supplied. */
function evidText(v,l){
 if(v==null||v==="")return null;
 /* A declaration beats a guess. {lang:"de", text:"…"} states the language of
    a single-language string, so the row label names it on the tool's word
    instead of on the script the engine read. Without a declaration the script
    is all there is: Cyrillic is read as `uk`, everything else as `en`, which
    is what AGENTS §0 makes the manifest's source slot. A tool whose plain
    string is German, Dutch or Polish declares `lang` and is printed under its
    own language; over the current registry -- 194 plain reference/tolerance
    fields and 519 plain citations -- none is non-English Latin. */
 if(v&&typeof v==="object"&&!Array.isArray(v)&&typeof v.lang==="string"&&LANGS.indexOf(v.lang)>=0){
  const t=v.text!==undefined?v.text:v.value;
  if(t!==undefined&&t!==null&&String(t).trim()!=="")return{text:String(t),lang:v.lang,declared:true};
 }
 if(typeof v==="object"&&!Array.isArray(v)){
  const ks=Object.keys(v);
  if(ks.length&&ks.every(k=>LANGS.indexOf(k)>=0)){
   if(v[l]!==undefined&&String(v[l]).trim()!=="")return{text:String(v[l]),lang:l};
   for(let i=0;i<LANGS.length;i++){const k=LANGS[i];
    if(v[k]!==undefined&&String(v[k]).trim()!=="")return{text:String(v[k]),lang:k}}
   return null;
  }
 }
 const s=cellText(v,l);
 if(!s)return null;
 return{text:s,lang:/[\u0400-\u04FF]/.test(s)?"uk":"en"};
}
/* "Reference" in a Polish sheet whose reference text is English reads
   "Reference [EN]". A field already in the report language carries no tag. */
function evidLabel(base,lang,l){return lang&&lang!==l?base+" ["+String(lang).toUpperCase()+"]":base}
function benchSummary(l){
 const bs=benchmarks();if(!bs.length)return null;
 return bs.map(b=>{
  const ref=evidText(b.reference,l),tol=evidText(b.tolerance,l);
  const cits=(Array.isArray(b.citations)?b.citations:(b.citations?[b.citations]:[]))
   .map(c=>evidText(c,l)).filter(Boolean);
  /* Only the languages a reader would otherwise mistake for the report's own
     are named: a citation already in the report language needs no tag. The
     annex decides per citation, so the list travels whole. */
  return{
   id:b.id||"",
   cases:tr("rCases",l).replace("%p",b.passed).replace("%c",b.cases),
   ref:ref?ref.text:"",refLang:ref?ref.lang:"",
   cits:cits,
   tol:tol?tol.text:"",tolLang:tol?tol.lang:"",
   run:b.run_at||"",art:b.artifact||""};
 });
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
 if(typeof v==="number")return reportNumber(v,l);
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
 return fmtCell(v,l);
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
 /* Markup a tool builds with class names carries no appearance of its own:
    the rules live in the tool's stylesheet, and the report is a separate
    document without it. Printed raw, the Moody chart lost the stroke on its
    friction curves and, <path> elements defaulting to fill, painted the whole
    plot area black. Resolve the appearance here, where the stylesheet still
    applies, by the same route a live SVG figure takes. */
 /* Keyed on the presence of a class attribute this ran for some tools and not
    others, and the ones it skipped kept their on-screen chrome: the rotate
    handle of stress_transformation carries an id and no class, so a grip for a
    gesture no reader of paper can make was printed beside the element. Every
    figure takes the same route. */
 let out=raw;
 {const f=figureFrom(raw,{});if(f&&f.markup)out=f.markup}
 return figWrap(sanitizeSVG(out),cap,width,l);
}
/* One figure spec, or an array of them, -> flow items. A tool can hold more
   than one drawing and they need not be of one kind: a CFD sheet hands over
   the geometry as vector and the temperature field as raster in the same list,
   so the kind is decided per item. Pass "svg" or "image" to force it. */
function figItems(v,kind,l){
 const list=Array.isArray(v)?v:[v];
 return list.filter(x=>x!=null&&x!=="").map(x=>{
  const o=(typeof x==="object")?x:{};
  const cap=o.caption||o.title||"",w=o.width||"",alt=o.alt||"";
  const k=(kind&&kind!=="auto")?kind
   :((o.markup!==undefined||o.svg!==undefined)?"svg":"image");
  return k==="svg"?fSvg(o.markup!==undefined?o.markup:(o.svg!==undefined?o.svg:x),cap,w,l)
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
/* manifest.intended_use carries a controlled vocabulary in English. Printed
   verbatim it read as three machine keys stacked one per paragraph. Translate
   what is known, humanise what is not, and print the set as one sentence. */
const IUSE={
 education:{en:"education",uk:"\u043d\u0430\u0432\u0447\u0430\u043d\u043d\u044f",de:"Ausbildung",nl:"onderwijs",fr:"enseignement",es:"ense\u00f1anza",pl:"edukacja"},
 technicalexploration:{en:"technical exploration",uk:"\u0442\u0435\u0445\u043d\u0456\u0447\u043d\u0435 \u0434\u043e\u0441\u043b\u0456\u0434\u0436\u0435\u043d\u043d\u044f",de:"technische Voruntersuchung",nl:"technische verkenning",fr:"exploration technique",es:"exploraci\u00f3n t\u00e9cnica",pl:"analiza techniczna"},
 preliminaryassessment:{en:"preliminary assessment",uk:"\u043f\u043e\u043f\u0435\u0440\u0435\u0434\u043d\u044f \u043e\u0446\u0456\u043d\u043a\u0430",de:"Vorbemessung",nl:"voorlopige beoordeling",fr:"\u00e9valuation pr\u00e9liminaire",es:"evaluaci\u00f3n preliminar",pl:"ocena wst\u0119pna"},
 teaching:{en:"teaching",uk:"\u0432\u0438\u043a\u043b\u0430\u0434\u0430\u043d\u043d\u044f",de:"Lehre",nl:"onderwijs",fr:"enseignement",es:"docencia",pl:"nauczanie"},
 designsupport:{en:"design support",uk:"\u043f\u0456\u0434\u0442\u0440\u0438\u043c\u043a\u0430 \u043f\u0440\u043e\u0435\u043a\u0442\u0443\u0432\u0430\u043d\u043d\u044f",de:"Planungsunterst\u00fctzung",nl:"ontwerpondersteuning",fr:"aide \u00e0 la conception",es:"apoyo al dise\u00f1o",pl:"wsparcie projektowania"}
};
function intendedUseText(v,l){
 const parts=asList(v,l).map(x=>{
  const k=String(x).toLowerCase().replace(/[^a-z]/g,"");
  return IUSE[k]?pick(IUSE[k],l):String(x);
 }).filter(Boolean);
 if(!parts.length)return"";
 const one=parts.join(", ");
 return one.charAt(0).toUpperCase()+one.slice(1)+".";
}
/* ---- handing a live on-screen figure to the report --------------------
   A tool draws its schematic with classes and CSS custom properties that live
   in the tool's own stylesheet. The report is a separate document with none of
   that: the same markup arrives there with no fill, no stroke and no type, so
   the figure that carried the engineering meaning was simply absent from the
   printed sheet. figureFrom() resolves the appearance where the stylesheet
   still applies -- in the tool's own document -- and writes the computed value
   of every property that decides how a vector mark looks onto the element
   itself. What reaches the report is then self-contained.
   A <canvas> cannot travel as markup at all and is handed over as a PNG
   data: URL, which is what the report accepts for raster figures (§1.3). */
const SVGPROPS=["fill","fill-opacity","fill-rule","stroke","stroke-width","stroke-opacity",
 "stroke-linecap","stroke-linejoin","stroke-dasharray","stroke-dashoffset","opacity","color",
 "font-family","font-size","font-weight","font-style","letter-spacing","text-anchor",
 "dominant-baseline","marker-start","marker-mid","marker-end","paint-order","text-transform"];
/* An editable drawing carries affordances that exist only for the pointer:
   connection ports, focus rings, drag handles, a delete cross. On screen they
   tell the reader what can be moved; on paper they are 44 dots and 21 rings
   over the engineering. They are dropped from the printed copy. A tool can
   overrule either way with data-print="keep" or data-print="skip". */
const UICHROME=/(^|[\s-])(port|handle|anchor|grip|knob|resize|rotate|marquee|cursor|selection|selected|foc|focus|hitbox|delete|remove|close)([\s-]|$)/i;
function stripInteractive(copy){
 const kill=[].slice.call(copy.querySelectorAll('[data-print="skip"]'));
 kill.forEach(el=>{if(el.parentNode)el.parentNode.removeChild(el)});
 copy.querySelectorAll("[data-print]").forEach(el=>el.removeAttribute("data-print"));
 return kill.length;
}
function inlineSVGStyle(live,copy){
 const a=[live].concat([].slice.call(live.querySelectorAll("*")));
 const b=[copy].concat([].slice.call(copy.querySelectorAll("*")));
 for(let i=0;i<a.length&&i<b.length;i++){
  let cs=null;try{cs=getComputedStyle(a[i])}catch(e){}
  if(!cs)continue;
  let d="";
  for(const p of SVGPROPS){const v=cs.getPropertyValue(p);if(v&&v!=="normal"&&v!=="auto"&&v!=="none"||(v==="none"&&(p==="fill"||p==="stroke")))d+=p+":"+v+";"}
  if(d)b[i].setAttribute("style",d);
  /* The class is the only record of what an element was for, and it is about
     to be discarded: decide here whether the printed copy keeps it. */
  /* An element's name is in its class or in its id, and a tool is free to use
     either: stress_transformation marks its drag target <circle id="rotHandle">
     with no class at all, so a handle for a gesture no reader can make was
     printed on the page. */
  const cls=a[i].getAttribute("class")||"",aid=a[i].getAttribute("id")||"";
  const pr=a[i].getAttribute("data-print");
  const chrome=(cls&&UICHROME.test(cls))||(aid&&UICHROME.test(aid.replace(/([a-z0-9])([A-Z])/g,"$1-$2")));
  if(pr!=="keep"&&(pr==="skip"||chrome))b[i].setAttribute("data-print","skip");
  b[i].removeAttribute("class");
 }
}
/* The report is printed on white paper. A tool left in dark theme would hand
   over a figure drawn for a dark ground, so the document theme is flipped to
   light for the measurement and restored in the same synchronous block: no
   frame is painted in between, so nothing flickers on screen. */
function withLightTheme(fn){
 const de=document.documentElement,had=de.getAttribute("data-theme");
 try{de.setAttribute("data-theme","light");return fn()}
 finally{if(had===null)de.removeAttribute("data-theme");else de.setAttribute("data-theme",had)}
}
function figureFrom(x,opts){
 opts=opts||{};
 if(Array.isArray(x))return x.map(y=>figureFrom(y,opts)).filter(Boolean);
 return safe(()=>{
  let host=null,node=null;
  if(typeof x==="string"&&/^\s*<svg[\s>]/i.test(x)){
   host=document.createElement("div");
   host.setAttribute("aria-hidden","true");
   host.style.cssText="position:fixed;left:-10000px;top:0;width:900px;pointer-events:none";
   host.innerHTML=x;document.body.appendChild(host);node=host.firstElementChild;
  }else node=(typeof x==="string")?document.querySelector(x):x;
  if(!node||node.nodeType!==1){if(host)host.remove();return null}
  const cv=(node.tagName.toLowerCase()==="canvas")?node:node.querySelector&&node.querySelector("canvas");
  if(cv&&!node.querySelector("svg")){
   let src=null;try{src=cv.toDataURL("image/png")}catch(e){warn(e)}
   if(host)host.remove();
   return src?{src:src,caption:opts.caption||"",width:opts.width||"",alt:opts.alt||opts.caption||""}:null;
  }
  const live=(node.tagName.toLowerCase()==="svg")?node:node.querySelector("svg");
  if(!live){if(host)host.remove();return null}
  const markup=withLightTheme(()=>{
   const copy=live.cloneNode(true);
   /* Order matters: inlineSVGStyle() pairs the live tree with the clone by
      document order, so nothing may be removed from the clone until every
      element has been given its computed appearance. */
   inlineSVGStyle(live,copy);
   if(opts.chrome!==true)stripInteractive(copy);
   if(!copy.getAttribute("viewBox")){
    const w=live.getAttribute("width")||live.clientWidth,h=live.getAttribute("height")||live.clientHeight;
    if(w&&h)copy.setAttribute("viewBox","0 0 "+parseFloat(w)+" "+parseFloat(h));
   }
   copy.setAttribute("width","100%");copy.removeAttribute("height");
   copy.setAttribute("preserveAspectRatio","xMidYMid meet");
   copy.removeAttribute("style");
   return copy.outerHTML;
  });
  if(host)host.remove();
  return markup?{markup:markup,caption:opts.caption||"",width:opts.width||""}:null;
 },null)();
}
/* ---- figures a tool did not hand over explicitly ----------------------
   Seventy-four of this site's tools carry no report profile of their own, and
   most of them draw something: a mesh, a temperature field, a characteristic,
   a psychrometric chart. Without a profile every one of those drawings was
   missing from the printed sheet while sitting on the screen the reader had
   just been looking at. So when a tool supplies no figure of its own, the
   report takes what the page is actually showing.
   Only what a reader would call a drawing qualifies: rendered, visible, and
   at least FIGMIN px on its short side, which leaves out icons, sparklines
   and the framework's own chrome. A tool that supplies figures keeps full
   control and nothing is added behind its back. */
const FIGMIN=150,FIGMAX=8;
const FIGSKIP=/\b(dgu-(bar|toolbar|nav|btn|steps|home|sel|seg|chip|tab)|icon|logo|sparkline|swatch)\b/;
function figExcluded(el){
 for(let n=el;n&&n.nodeType===1;n=n.parentElement){
  const t=(n.tagName||"").toLowerCase();
  if(t==="button"||t==="a"||t==="label"||t==="nav"||t==="summary")return true;
  if(n.id==="dgc-report-frame")return true;
  if(n.hasAttribute("hidden")||n.getAttribute("aria-hidden")==="true")return true;
  const c=n.getAttribute("class")||"";
  if(c&&FIGSKIP.test(c))return true;
 }
 return false;
}
/* A drawing without a caption is an illustration of nothing in particular.
   Take the caption the page already gives it, in the order a reader would. */
function figCaption(el){
 const pick1=v=>String(v==null?"":v).replace(/\s+/g," ").trim();
 let v=el.getAttribute("data-caption")||el.getAttribute("aria-label")||"";
 if(!v){const t=el.querySelector&&el.querySelector("title");if(t)v=t.textContent||""}
 if(!v){
  const fig=el.closest&&el.closest("figure");
  const cap=fig&&fig.querySelector("figcaption");
  if(cap)v=cap.textContent||"";
 }
 if(!v){
  let n=el;
  for(let i=0;i<3&&n;i++,n=n.parentElement){
   let p=n.previousElementSibling;
   while(p){
    if(/^h[1-6]$/i.test(p.tagName)){v=p.textContent||"";break}
    p=p.previousElementSibling;
   }
   if(v)break;
  }
 }
 v=pick1(v);
 return v.length>160?v.slice(0,157)+"…":v;
}
function sectionsHaveFigures(secs){
 return (secs||[]).some(x=>x&&(x.image||x.svg));
}
function autoFigures(){
 return safe(()=>{
  const out=[];
  const nodes=document.querySelectorAll("canvas,svg");
  for(let i=0;i<nodes.length&&out.length<FIGMAX;i++){
   const el=nodes[i];
   if(el.closest&&el.closest("svg")!==el&&el.tagName.toLowerCase()==="svg"&&el.parentElement&&el.parentElement.closest("svg"))continue;
   if(figExcluded(el))continue;
   let r=null;try{r=el.getBoundingClientRect()}catch(e){}
   if(!r||Math.min(r.width,r.height)<FIGMIN)continue;
   const f=figureFrom(el,{caption:figCaption(el)});
   if(f)out.push(f);
  }
  return out;
 },[])();
}
function domainLang(l){
 const m=manifest()||{},ls=Array.isArray(m.tool_languages)?m.tool_languages:[];
 return ls.includes(l)?l:(ls.includes("en")?"en":(ls[0]||"en"));
}
function asList(v,l){
 if(v==null||v==="")return[];
 return (Array.isArray(v)?v:[v]).map(x=>cellText(x,l)).filter(Boolean);
}
function labelMapValue(map,k,l){
 if(!map||map[k]===undefined)return"";
 return cellText(map[k],l);
}
function valueMapValue(map,k,v,l){
 if(!map||!map[k])return null;
 const byKey=map[k],hit=byKey&&typeof byKey==="object"?byKey[String(v)]:undefined;
 return hit===undefined?null:cellText(hit,l);
}
function profileRows(v,l){
 if(!Array.isArray(v))return[];
 return v.map(x=>{
  if(Array.isArray(x))return{label:cellText(x[0],l),value:cellText(x[1],l),unit:cellText(x[2],l),note:cellText(x[3],l)};
  if(x&&typeof x==="object")return Object.assign({},x,{
   label:cellText(x.label!==undefined?x.label:(x.title!==undefined?x.title:x.key),l),
   value:x.value,unit:cellText(x.unit,l),note:cellText(x.note!==undefined?x.note:x.interpretation,l)
  });
  return{label:cellText(x,l),value:""};
 }).filter(x=>x.label||x.value!==undefined);
}
function objectRows(obj,rec,l,labels,values){
 return Object.keys(obj||{}).map(k=>{
  const named=labelMapValue(labels,k,l);
  return{key:k,named:!!named,
   label:named||reportKey(k,rec.units[k]||"",l),
   value:valueMapValue(values,k,obj[k],l)||obj[k],unit:rec.units[k]||""};
 });
}
function normalStatus(s){
 s=String(s||"info").toLowerCase();
 if(["ok","pass","passed","conform","conforme"].includes(s))return"pass";
 if(["bad","fail","failed","block","blok","error","critical"].includes(s))return"fail";
 if(["warn","warning","attention","advies","waarschuwing"].includes(s))return"attention";
 return"info";
}
function checkRows(v,l){
 return (Array.isArray(v)?v:[]).map(x=>{
  if(typeof x==="string")return{status:"attention",title:x};
  if(Array.isArray(x))return{status:normalStatus(x[0]),title:cellText(x[1],l),basis:cellText(x[2],l)};
  x=x||{};return{
   status:normalStatus(x.status!==undefined?x.status:x.level),
   title:cellText(x.title!==undefined?x.title:(x.label!==undefined?x.label:x.check),l),
   detail:cellText(x.detail!==undefined?x.detail:x.text,l),
   actual:cellText(x.actual,l),criterion:cellText(x.criterion,l),
   basis:cellText(x.basis!==undefined?x.basis:x.reference,l),action:cellText(x.action,l)
  };
 }).filter(x=>x.title||x.detail);
}
function profileContext(rec,l){
 const m=manifest()||{};
 return{lang:l,siteLang:l,domainLang:domainLang(l),record:rec,manifest:m,pick:pick,
  figure:figureFrom,
  label:(k,u)=>reportKey(k,u||rec.units[k]||"",l),
  value:(v,u)=>reportValue(v,u||"",l),
  row:(label,value,unit,note)=>({label,value,unit,note}),
  check:(status,title,detail,basis)=>({status,title,detail,basis})};
}
/* A record flattens a network to scalars: pressure_R1, pressure_R2, flow_K1,
   velocity_K1 ... Printed one per row, a four-room model fills a page with
   machine names and a forty-room model fills a booklet -- repeating numbers
   the tool already tabulates in its own sections. A key that stands alone is
   a result and is printed. A key that repeats under one stem is a series, and
   a series is reported by its count and its range; the members stay in the
   tool's own tables, where they have proper headings. */
const SERIESMIN=3;
function splitSeries(rows){
 const stem=k=>String(k||"").replace(/_[^_]+$/,"");
 const count={};
 rows.forEach(r=>{const st=stem(r.key);if(st&&st!==r.key)count[st]=(count[st]||0)+1});
 const single=[],series=[],seen={};
 rows.forEach(r=>{
  const st=stem(r.key);
  if(!st||st===r.key||count[st]<SERIESMIN){single.push(r);return}
  /* Folding is for keys a tool generates per node -- pressure_R1, flow_K1 --
     which carry no name of their own. R_hot, R_cold and R_wall share a stem
     too, but each is a named quantity; folded and labelled by the stem "R"
     they printed as three values of the specific gas constant. A key the
     vocabulary knows is a result, not a series member. */
  if(QTYIDX[qnorm(r.key)]||r.named){single.push(r);return}
  if(!seen[st]){seen[st]={key:st,unit:r.unit,members:[]};series.push(seen[st])}
  seen[st].members.push(r);
 });
 return{single:single,series:series};
}
function seriesRow(g,rec,l){
 const nums=g.members.map(m=>m.value).filter(v=>typeof v==="number"&&isFinite(v));
 const lo=nums.length?Math.min.apply(null,nums):null;
 const hi=nums.length?Math.max.apply(null,nums):null;
 const txt=nums.length
  ?tr("rSeries",l).replace("%n",String(nums.length))
    .replace("%a",reportNumber(lo,l)).replace("%b",reportNumber(hi,l))
    +(g.unit&&g.unit!=="-"?" "+prettyUnit(g.unit):"")
  :tr("rSeries",l).replace("%n",String(g.members.length)).replace("%a","—").replace("%b","—");
 return{key:g.key,label:reportKey(g.key,g.unit||"",l),text:txt,unit:""};
}
function foldSeries(rows,rec,l){
 const sp=splitSeries(rows);
 if(!sp.series.length)return rows;
 return sp.single.concat(sp.series.map(g=>seriesRow(g,rec,l)));
}
function defaultReportProfile(rec,l,extra){
 const m=manifest()||{},rc=(CFG.report&&typeof CFG.report==="object")?CFG.report:{};
 const labels=Object.assign({},rc.labels||{},(extra&&extra.labels)||{});
 const values=Object.assign({},rc.values||{},(extra&&extra.values)||{});
 const dl=domainLang(l);
 const results=foldSeries(objectRows(rec.outputs,rec,dl,labels,values),rec,dl);
 const inputs=foldSeries(objectRows(rec.inputs,rec,dl,labels,values),rec,dl);
 /* A tile is read at a glance, so it holds one number. An array-valued
    output -- a coefficient vector, a pole list -- belongs in the table, where
    it is folded to its count and range. */
 const tileable=r=>{const v=r.value;
  return v!==null&&v!==undefined&&v!==""&&!Array.isArray(v)
   &&(typeof v!=="object"||v.value!==undefined||v.text!==undefined)};
 let primary=Array.isArray(rc.primary)?rc.primary.map(k=>results.find(r=>r.key===k)).filter(Boolean)
  :results.filter(tileable).slice(0,6);
 /* No fallback to "whatever the first six keys are": a record with nothing
    computed produced six tiles reading "—", which states the layout and not
    the state. With no value to show, the grid is not printed. */
 if(!primary.length)primary=results.filter(r=>r.value!==null&&r.value!==undefined&&r.value!=="").slice(0,6);
 const warnings=asList(rec.warnings,l);
 const checks=warnings.map(w=>({status:"attention",title:w}));
 /* The benchmark reference and its citations print once, in the traceability
    annex, which the engine always writes. They used to be copied in here as
    well, and page one repeated them a third time, so a two-sentence reference
    reached the sheet three times and tripped the AGENTS §8 duplicate rule on
    every benchmarked tool. The validation basis is a different fact and is
    printed nowhere else, so it stays. A tool that supplies its own
    method.references replaces this list, which is the second reason the
    annex, not this list, is the one copy. */
 const refs=[];
 const vb=m.validation&&m.validation.basis?cellText(m.validation.basis,l):"";
 if(vb)refs.push(vb);
 return{
  title:tr("rTitle",l),labels:labels,values:values,project:[],
  executive:{text:[warnings.length?tr("rAutoSummaryWarn",l).replace("%n",warnings.length):tr("rAutoSummaryOk",l)],results:primary,conclusion:""},
  purpose:asList(m.summary,l),scope:asList(m.description,l),intendedUse:asList(m.intended_use,l),
  /* The inputs annex carries every input already. A twelve-row excerpt of it
     near the front was the same table twice under two headings. */
  assumptions:[],system:null,results:results.filter(r=>(r.text!==undefined&&r.text!=="")||(r.value!==null&&r.value!==undefined&&r.value!=="")),decisions:[],checks:checks,
  /* The model's limits close the document in their own block; repeating them
     here as a risk card printed the same paragraph twice. */
  risks:[],actions:[],
  method:{equations:(rec.model&&rec.model.equations)||[],ranges:(rec.model&&rec.model.ranges)||[],notes:(rec.model&&rec.model.notes)||[],references:refs},
  questions:[],figures:[],inputs:inputs,appendices:[]
 };
}
function mergeReportProfile(base,extra){
 if(!extra||typeof extra!=="object")return base;
 const out=Object.assign({},base,extra);
 ["executive","method","system"].forEach(k=>{
  if(base[k]&&typeof base[k]==="object"&&!Array.isArray(base[k])&&extra[k]&&typeof extra[k]==="object"&&!Array.isArray(extra[k]))
   out[k]=Object.assign({},base[k],extra[k]);
 });
 out.labels=Object.assign({},base.labels||{},extra.labels||{});
 out.values=Object.assign({},base.values||{},extra.values||{});
 return out;
}
/* One address, one row. AGENTS §2.2 makes the full permalink page-one
   furniture, so since v4.16 the engine prints it itself; four tools built
   against the older engine print their own copy as well, and on one of them
   the two rows label the same address differently -- "reopens this exact
   state" against "settings only". AGENTS §4.1: nothing said twice in one
   document. The engine's row is the one kept, because it is the row §2.2
   specifies and the only one laid out full width. Any tool-supplied row or
   single-cell table row carrying this page's own address is dropped here,
   before the sheet is built. A row that is the full permalink plus a
   qualifier -- "… (settings only; the full state is in the JSON record)" --
   is the tool telling the reader something the engine cannot know, so the
   qualifier is carried over to the engine's row and the engine's label drops
   to the bare word: the caveat survives, the contradiction does not. */
function permaOwn(rec){
 const u=String(rec&&rec.permalink||"");
 if(!/^https?:\/\//i.test(u))return null;
 return{full:u,base:u.split(/[?#]/)[0]};
}
function permaRowText(r,l){
 const parts=[r&&r.label,(r&&r.text!==undefined)?cellText(r.text,l):(r&&r.value),r&&r.note];
 return parts.map(x=>(x==null?"":(typeof x==="object"?cellText(x,l):String(x)))).join(" ");
}
function permaStrip(p,rec,l){
 const o=permaOwn(rec);
 p._permaNote="";
 if(!o)return p;
 const hit=t=>String(t||"").indexOf(o.base)>=0;
 const adopt=t=>{
  const s=String(t||"").trim();
  if(s.indexOf(o.full)!==0)return;
  let rest=s.slice(o.full.length).trim().replace(/^[·—–,;:.\-\s]+/,"").replace(/^\((.*)\)$/,"$1").trim();
  if(rest&&rest.length<=200&&!p._permaNote)p._permaNote=rest;
 };
 ["project","results","assumptions","decisions","inputs"].forEach(k=>{
  if(!Array.isArray(p[k]))return;
  p[k]=p[k].filter(r=>{const t=permaRowText(r,l);if(!hit(t))return true;adopt((r&&r.text!==undefined)?cellText(r.text,l):(r&&r.value));return false});
 });
 if(Array.isArray(p.appendices))p.appendices=p.appendices.map(sec=>{
  if(!sec||!Array.isArray(sec.rows)||!sec.rows.length)return sec;
  const rows=sec.rows.filter(r=>{
   const cells=(r||[]).map(c=>cellText(c,l));
   if(!cells.some(hit))return true;
   cells.forEach(adopt);return false;
  });
  if(rows.length===sec.rows.length)return sec;
  /* A section that held nothing but the address leaves with it; its heading
     would otherwise stand over an empty table. */
  if(!rows.length&&!sec.text&&!sec.image&&!sec.svg&&!sec.html&&!(sec.notes||[]).length)return null;
  return Object.assign({},sec,{rows:rows});
 }).filter(Boolean);
 return p;
}
function reportProfile(rec,l){
 let p=defaultReportProfile(rec,l);
 if(CFG.report&&typeof CFG.report.profile==="function"){
  const own=safe(CFG.report.profile,null)(rec,profileContext(rec,l));
  /* The profile function runs after the automatic rows have been built, so a
     labels or values map it returns arrived too late to name anything: the
     flow regime still printed as the classifier's own word "smooth". Build
     the automatic part again with the maps in hand, then merge. */
  if(own&&(own.labels||own.values))p=defaultReportProfile(rec,l,{labels:own.labels,values:own.values});
  p=mergeReportProfile(p,own);
 }
 const dl=domainLang(l);p._contentLang=dl;p.title=cellText(p.title,dl);
 /* A tool's one-line summary is usually the opening sentence of its longer
    description. Printed one after the other that sentence appeared twice, and
    the paragraph guard cannot drop a line it has already placed: resolve it
    here, where both are still in hand. */
 {const sc=asList(p.scope,dl);
  p.purpose=asList(p.purpose,dl).filter(x=>!sc.some(y=>y!==x&&normText(y).indexOf(normText(x))>=0));}
 p.project=profileRows(p.project,dl);p.assumptions=profileRows(p.assumptions,dl);
 p.results=profileRows(p.results,dl);p.decisions=profileRows(p.decisions,dl);
 p.inputs=profileRows(p.inputs,dl);p.checks=checkRows(p.checks,dl);p.risks=checkRows(p.risks,dl);
 p.actions=checkRows(p.actions,dl);p.questions=asList(p.questions,dl);
 permaStrip(p,rec,dl);
 return p;
}
/* A trailing column that is empty in every row is not a column: it is white
   space with a heading over it. Drop it, and drop the matching track from the
   grid template so the remaining columns take the width back. */
function trimTable(head,rows,cols){
 let h=head.slice(),r=rows.map(x=>x.slice()),c=String(cols||"");
 while(h.length>2&&r.every(x=>!String(x[h.length-1]==null?"":x[h.length-1]).trim())){
  h.pop();r.forEach(x=>x.pop());
  const tr=c.trim().match(/(?:[^\s()]|\([^)]*\))+/g);
  if(tr&&tr.length===h.length+1){tr.pop();c=tr.join(" ")}else c="";
 }
 return{head:h,rows:r,cols:c};
}
function reportTable(it,title,head,rows,cols,l){
 if(!rows||!rows.length)return;
 {const t=trimTable(head,rows,cols);head=t.head;rows=t.rows;cols=t.cols}
 it.push(fH(title,2));
 const tid="p"+Math.random().toString(36).slice(2,8),st=cols?' style="grid-template-columns:'+esc(cols)+'"':"";
 it.push(fRow(head,"cN",tid,true).replace("<div ",'<div'+st+" "));
 rows.forEach(r=>it.push(fRow(r,"cN",tid).replace("<div ",'<div'+st+" ")));
}
/* Nothing in a report may be said twice. A tool's manifest summary is often
   the opening sentence of its description, and a tool profile may repeat a
   sentence it already handed to another section; printed, that reads as
   padding. SEEN holds the normalised text of every narrative paragraph
   already placed in the current document: an exact repeat is dropped, and so
   is a paragraph wholly contained in one already printed. Reset per report. */
let SEEN=null;
/* An ellipsis is punctuation too. A tool whose one-line summary is its
   description cut short -- "... en een warmtepompontvochtiger..." -- was not
   recognised as contained in the description, so both were printed. */
function normText(x){return String(x==null?"":x).toLowerCase().replace(/[\s\u00a0]+/g," ").replace(/[.,;:!?()\[\]\u2014\u2013\u2026-]/g,"").trim()}
function seenAdd(x){
 const k=normText(x);
 if(!k)return false;
 if(!SEEN)return true;
 for(const prev of SEEN)if(prev===k||prev.indexOf(k)>=0)return false;
 SEEN.add(k);return true;
}
/* The questionnaire annex is the document's evidence: every question the tool
   asked and the answer it used. When the tool groups its inputs the annex
   prints those groups as headings and drops to two columns. The flat table it
   replaces carried a third column that repeated the group name on every row --
   on a 108-question sheet, 108 repetitions of 15 strings. */
function reportQuestionnaire(it,title,rows,l){
 if(!rows||!rows.length)return;
 if(!rows.some(r=>r.group)){
  reportTable(it,title,[tr("rProp",l),tr("rVal",l),tr("rNotes",l)],
   rows.map(r=>[r.label,resultText(r,l),r.note||""]),"minmax(48mm,1.15fr) minmax(38mm,.8fr) minmax(0,1.25fr)",l);
  return;
 }
 it.push(fH(title,2));
 const st=' style="grid-template-columns:minmax(62mm,1.3fr) minmax(0,1fr)"';
 let cur=null,tid="";
 rows.forEach(r=>{
  const g=r.group||"";
  if(g!==cur){cur=g;tid="q"+Math.random().toString(36).slice(2,8);if(g)it.push(fH(g,3))}
  it.push(fRow([r.label,resultText(r,l)],"cN",tid).replace("<div ",'<div'+st+" "));
 });
}
/* Questions to put to a supplier are a numbered list a reader works down, not
   a stack of status cards: they carry no status to report. */
function reportQuestions(it,list,l){
 if(!list||!list.length)return;
 it.push(fH(tr("rQuestions",l),2));
 list.forEach((q,i)=>it.push('<div class="qn"><span>'+(i+1)+'.</span><div>'+esc(q)+"</div></div>"));
}
function reportNarrative(it,v,l,cls){asList(v,l).forEach(x=>{if(seenAdd(x))it.push(fP(x,cls))})}
/* Push a heading, then whatever fn() adds. If the redundancy guard swallowed
   the entire body, the heading leaves with it -- an empty section title is
   itself a form of repetition. */
function headed(it,head,fn){const n=it.length;it.push(head);fn();if(it.length===n+1)it.pop()}
function resultText(r,l){
 const body=(r.text!==undefined)?cellText(r.text,l):reportValue(r.value,r.unit||"",l);
 return body;
}
function metricGrid(rows,l){
 if(!rows||!rows.length)return"";
 return'<div class="metric-grid">'+rows.slice(0,6).map(r=>'<div class="metric"><div class="metric-k">'+esc(r.label)+'</div>'
  +'<div class="metric-v">'+esc(resultText(r,l))+'</div>'+(r.note?'<div class="metric-note">'+esc(r.note)+'</div>':"")+'</div>').join("")+"</div>";
}
function checkCard(x,l){
 const s=normalStatus(x.status),word=tr({pass:"rPass",attention:"rAttention",fail:"rFail",info:"rInfo"}[s],l);
 const lines=[];
 if(x.detail)lines.push('<div class="check-detail">'+esc(x.detail)+'</div>');
 if(x.actual)lines.push('<div><b>'+esc(tr("rActual",l))+':</b> '+esc(x.actual)+'</div>');
 if(x.criterion)lines.push('<div><b>'+esc(tr("rCriterion",l))+':</b> '+esc(x.criterion)+'</div>');
 if(x.basis)lines.push('<div><b>'+esc(tr("rBasisCol",l))+':</b> '+esc(x.basis)+'</div>');
 if(x.action)lines.push('<div><b>'+esc(tr("rAction",l))+':</b> '+esc(x.action)+'</div>');
 return'<div class="check check-'+s+'"><div class="check-head"><span>'+esc(word)+'</span><b>'+esc(x.title||"")+"</b></div>"+lines.join("")+"</div>";
}
function flowBlock(system,l){
 if(!system||!Array.isArray(system.flow)||!system.flow.length)return"";
 return'<div class="flow">'+system.flow.map((x,i)=>'<div class="flow-node"><span class="flow-n">'+(i+1)+'</span><b>'+esc(cellText(x.label!==undefined?x.label:x,l))+'</b>'
  +(x.detail?'<small>'+esc(cellText(x.detail,l))+'</small>':"")+'</div>').join("")+"</div>";
}
function reportItems(rec,opts,l){
 SEEN=new Set();
 const it=[],p=reportProfile(rec,l),cl=p._contentLang||l,valid=rec.tool.independent_validation?tr("rYes",l):tr("rNo",l);
 it.push('<div class="report-lead"><div class="report-kicker">'+esc(p.title||tr("rTitle",l))+'</div>'
  +'<div class="doctitle">'+esc(rec.tool.title)+'</div><div class="report-tags">'
  +'<span><b>'+esc(tr("rStatus",l))+':</b> '+esc(statusWord(l,rec.tool.status))+'</span>'
  +'<span><b>'+esc(tr("rRevision",l))+':</b> '+esc(rec.tool.manifest_revision||"—")+'</span>'
  +'<span><b>'+esc(tr("rIndep",l))+':</b> '+esc(valid)+'</span></div></div>');
 /* Page-one document control: the generation stamp, the manifest revision, the
    Source row, the state fingerprint beside the encoded state's length in
    characters, and one row for the address. The record always carries the
    permalink field; it carries an encoded state only for a tool that
    registered a state codec, and the label says which of the two this link is.
    A full-width row, because a two-column grid cell breaks a long URL into a
    column that no longer reads back as one address.
    The block and the benchmark strip are emitted BEFORE the project grid. The
    pager moves an item whole when it does not fit, so a document control
    emitted after a tool's leading grid -- `equipmentdatasheet`, eleven rows --
    lands on page 2 with the mandatory Source row, in all seven languages.
    Emitted second, straight after the lead, the block cannot be displaced by
    content the engine does not control. */
 const permaS=String(rec.permalink||"");
 const permaNote=String(p._permaNote||"");
 /* Length of the `s=` payload, which is what makes the address long, and the
    fingerprint of those same bytes. A record saved earlier carries its own
    fingerprint; one saved before this engine is fingerprinted from its stored
    permalink, which holds the same payload. */
 const permaLen=statePayload(permaS).length;
 const permaFp=permaLen?String(rec.state_fingerprint||stateFingerprint(permaS)):"";
 /* Three states, one rule, stated at PERMA_INLINE_MAX and not restated here.
    A tool with
    no state codec has nothing to move and keeps the row v4.16 gave it. */
 const permaTrail=permaLen>0&&permaS.length>PERMA_INLINE_MAX;
 it.push('<div class="report-meta">'
  +'<div class="meta-row"><span class="meta-k">'+esc(tr("rGen",l))+'</span><span class="meta-v">'+esc(rec.generated_at)+'</span>'
  +'<span class="meta-k">'+esc(tr("rRevision",l))+'</span><span class="meta-v">'+esc(rec.tool.manifest_revision||"—")+'</span></div>'
  +'<div class="meta-row wide"><span class="meta-k">'+esc(tr("rSource",l))+'</span><span class="meta-v">'+esc(rec.source)+'</span></div>'
  /* The character count is what a reader uses to decide whether to turn to the
     end of the document, so it is printed only when the address is there. With
     the address itself three lines below, the count is AGENTS §4.1's "said
     twice". The fingerprint stays either way: it is what a sheet is compared
     with a page by. */
  +(permaFp?'<div class="meta-row"><span class="meta-k">'+esc(tr("rStateFp",l))+'</span>'
    +'<span class="meta-v meta-url">'+esc(fpText(permaFp))+'</span>'
    +(permaTrail?'<span class="meta-k">'+esc(tr("rStateLen",l))+'</span>'
      +'<span class="meta-v">'+esc(charsText(permaLen,l))+'</span>':"")+'</div>':"")
  +(permaS&&permaTrail?'<div class="meta-row wide"><span class="meta-k">'+esc(tr("rPermaBare",l))+'</span>'
    +'<span class="meta-v">'+esc(tr("rPermaEnd",l))+'</span></div>':"")
  +(permaS&&!permaTrail?'<div class="meta-row wide stack"><span class="meta-k">'
    +esc(tr(permaNote?"rPermaBare":(permaLen?"rPerma":"rPermaNone"),l))+'</span>'
    +'<span class="meta-v meta-url">'+esc(permaS)+'</span>'
    +(permaNote?'<span class="meta-note">'+esc(permaNote)+'</span>':"")+'</div>':"")
  +'</div>');
 const bs=benchSummary(l);
 if(bs&&bs.length){
  /* The strip is the pointer to the evidence -- how many cases passed and
     where the benchmark report is. The reference text itself belongs to the
     traceability annex and is not restated here. */
  it.push('<div class="benchmark-strip"><b>'+esc(tr("rBench",l))+':</b> '+esc(bs.map(b=>b.cases).join(" | "))
   +(hasReport()?'<div class="meta-url">'+esc(reportURL(l))+'</div>':"")+"</div>");
 }
 if(p.project.length){
  it.push('<div class="project-grid">'+p.project.map(r=>'<div><span>'+esc(r.label)+'</span><b>'+esc(resultText(r,l))+'</b></div>').join("")+"</div>");
 }

 it.push(fH(tr("rExecutive",l),2));
 reportNarrative(it,p.executive&&p.executive.text,cl);
 const metrics=metricGrid(profileRows(p.executive&&p.executive.results,cl),l);if(metrics)it.push(metrics);
 if(p.executive&&p.executive.conclusion)
  headed(it,fH(tr("rConclusion",l),3),()=>reportNarrative(it,p.executive.conclusion,cl));

 reportTable(it,tr("rBasis",l),[tr("rProp",l),tr("rVal",l),tr("rNotes",l)],
  p.assumptions.map(r=>[r.label,resultText(r,l),r.note||""]),"minmax(42mm,1.05fr) minmax(35mm,.8fr) minmax(0,1.4fr)",l);

 if(p.system&&(asList(p.system.text,cl).length||(p.system.flow||[]).length
  ||(Array.isArray(p.system.figure)?p.system.figure.length:!!p.system.figure))){
  it.push(fH(tr("rSystem",l),2));reportNarrative(it,p.system.text,cl);
  const fl=flowBlock(p.system,cl);if(fl)it.push(fl);
  figItems(p.system.figure,"auto",cl).forEach(x=>it.push(x));
 }

 /* Whatever stands in the summary tiles is not restated in the table below
    them: the tiles are the headline, the table is what the headline left out. */
 {const shown={};
  profileRows(p.executive&&p.executive.results,cl).forEach(r=>{
   if(r.key)shown["k:"+r.key]=1;
   if(r.label)shown["l:"+normText(r.label)]=1;
  });
  const rest=p.results.filter(r=>!(shown["k:"+r.key]||shown["l:"+normText(r.label)]));
  reportTable(it,tr("rOutputs",l),[tr("rProp",l),tr("rVal",l),tr("rNotes",l)],
   rest.map(r=>[r.label,resultText(r,l),r.note||""]),"minmax(48mm,1.15fr) minmax(35mm,.75fr) minmax(0,1.35fr)",l);}
 reportTable(it,tr("rDecisions",l),[tr("rSelection",l),tr("rReason",l),tr("rDriver",l),tr("rBasisCol",l)],
  p.decisions.map(r=>[r.label,resultText(r,l),r.note||cellText(r.driver,l),cellText(r.basis,l)]),"1fr 1.35fr 1.2fr .8fr",l);

 it.push(fH(tr("rChecks",l),2));
 if(p.checks.length)p.checks.forEach(x=>it.push(checkCard(x,l)));else it.push(fP(tr("rNoChecks",l),"small"));

 if(p.risks.length||p.actions.length){
  it.push(fH(tr("rRisks",l),2));
  p.risks.forEach(x=>it.push(checkCard(x,l)));p.actions.forEach(x=>it.push(checkCard(x,l)));
 }

 /* Auto-collection is the fallback for a tool that ships no figure of its
    own -- through the profile, through the legacy sections provider, or as a
    legacy body. Any of those means the tool has decided what to show, and
    nothing is added behind its back. */
 {const own=v=>Array.isArray(v)?v.length>0:!!v;
  if(!own(p.figures)&&!(p.system&&own(p.system.figure))
   &&!sectionsHaveFigures(opts.sections)&&!opts.body)p.figures=autoFigures();}

 /* Figures that show a result rather than the arrangement of the plant --
    a temperature field, a plotted distribution, a mesh -- belong with the
    numbers they illustrate, after the results and the reasoning, not in the
    system description. */
 if(p.figures&&p.figures.length){
  const figs=figItems(p.figures,"auto",cl);
  if(figs.length){it.push(fH(tr("rFigures",l),2));figs.forEach(x=>it.push(x))}
 }

 reportQuestions(it,p.questions,l);

 /* Legacy providers remain readable during migration, but they no longer own
    the document. A structured profile always wins; legacy blocks are merely
    supporting analysis inside the common outline. */
 let legacy=null;
 if(!(CFG.report&&typeof CFG.report.profile==="function")&&CFG.report&&typeof CFG.report.render==="function")
  legacy=safe(CFG.report.render,null)(rec,renderCtx(rec,l));
 if(opts.body)legacy=opts.body;
 if(legacy!=null&&legacy!==false&&legacy!=="")
  (Array.isArray(legacy)?legacy:[legacy]).forEach(x=>{if(x!=null&&x!=="")it.push(String(x))});
 sectionItems(opts.sections,cl).forEach(x=>it.push(x));
 sectionItems(p.appendices,cl).forEach(x=>it.push(x));

 /* What the tool is for, and how it computes, are statements about the
    instrument rather than about the project. Read first they displaced the
    engineering: on an A4 sheet the description alone ran a dozen lines and
    pushed the system schematic off page one. They belong with the method,
    the model limits and the disclaimer, which is where a reader goes to
    weigh the number rather than to read it. */
 headed(it,fH(tr("rPurpose",l),2),()=>{reportNarrative(it,p.purpose,cl);reportNarrative(it,p.scope,cl)});
 const iuse=intendedUseText(p.intendedUse,cl);
 if(iuse){it.push(fH(tr("rIntended",l),3));it.push(fP(iuse))}

 const md=p.method||{};
 if(asList(md.equations,cl).length||asList(md.ranges,cl).length||asList(md.notes,cl).length||asList(md.references,cl).length){
  it.push(fH(tr("rMethod",l),2));
  if(asList(md.equations,cl).length){it.push(fH(tr("rEq",l),3));asList(md.equations,cl).forEach(e=>it.push(fP(e,"mono")))}
  if(asList(md.ranges,cl).length){it.push(fH(tr("rRanges",l),3));reportNarrative(it,md.ranges,cl)}
  if(asList(md.notes,cl).length){it.push(fH(tr("rNotes",l),3));reportNarrative(it,md.notes,cl)}
  if(asList(md.references,cl).length){it.push(fH(tr("rReferences",l),3));reportNarrative(it,md.references,cl,"small")}
 }

 reportQuestionnaire(it,tr("rAppendixInputs",l),p.inputs,l);
 it.push(fH(tr("rAppendixTrace",l),2));
 it.push(fRow([tr("rGenerated",l)||tr("rGen",l),rec.generated_at],"kv"));
 it.push(fRow([tr("rSource",l),rec.source],"kv"));
 it.push(fRow([tr("rRevision",l),rec.tool.manifest_revision||"—"],"kv"));
 it.push(fRow([tr("rStatus",l),statusWord(l,rec.tool.status)],"kv"));
 it.push(fRow([tr("rIndep",l),valid],"kv"));
 /* The one place the benchmark evidence is printed in full. The report URL
    is not repeated here: page one carries it and so does every page footer. */
 if(bs&&bs.length){it.push(fH(tr("rBench",l),3));let tagged=false;
  const tag=(k,lang)=>{if(lang&&lang!==l)tagged=true;return evidLabel(tr(k,l),lang,l)};
  bs.forEach(b=>{
  /* The case tally is a benchmark fact and page one already prints it, where
     AGENTS §2.2 requires the page-one benchmark summary. The annex prints
     what page one does not: which artifact the tally came from. */
  it.push(fRow([tr("rBenchId",l),b.id||"—"],"kv"));
  if(b.ref)it.push(fRow([tag("rRef",b.refLang),b.ref],"kv"));
  /* One label over a mixed list names both languages and attaches neither:
     "Źródła [UK/EN]" over one Ukrainian sentence and one English one leaves the
     reader to work out which is which. A list whose entries share a language
     stays one row; a mixed list becomes one numbered row per citation, so the
     tag on the label states the language of the sentence beside it. */
  if(b.cits&&b.cits.length){
   const cls=[];b.cits.forEach(c=>{if(cls.indexOf(c.lang)<0)cls.push(c.lang)});
   if(cls.length<2)it.push(fRow([tag("rReferences",cls[0]||""),b.cits.map(c=>c.text).join(" — ")],"kv small"));
   else b.cits.forEach((c,i)=>{if(c.lang!==l)tagged=true;
    it.push(fRow([evidLabel(tr("rReferences",l)+" "+(i+1),c.lang,l),c.text],"kv small"))});
  }
  if(b.tol)it.push(fRow([tag("rTol",b.tolLang),b.tol],"kv"));
  if(b.run)it.push(fRow([tr("rRun",l),b.run],"kv"));if(b.art)it.push(fRow([tr("rArtifact",l),siteBase()+b.art],"kv"));
 });if(tagged)it.push(fP(tr("rEvidLang",l),"small"))}
 /* The model's own limits close the document, next to the disclaimer they
    qualify. On page one they pushed the engineering narrative off the first
    page without being read any earlier for it. */
 if(rec.limitations)it.push('<div class="report-note"><div class="report-note-title">'+esc(tr("rLimits",l))+'</div>'
  +'<div>'+esc(cellText(rec.limitations,l))+'</div></div>');
 it.push(fP(tr("rDisc",l),"small"));
 /* The address, last. Page one carries the fingerprint, the character count
    and the pointer; the characters themselves stand here, after everything
    read for the engineering, where 27 printed lines of base64 cost the sheet
    nothing and the reader who wants them has already read that far. One item
    per segment (PERMA_SEG_MAX), so the pager moves each whole and the per-page
    footer (AGENTS §2.2) stays under it.
    The block carries the address and nothing else. The bare address without
    the `s=` payload -- 57 of technicalrequisition's 3 513 characters -- is the
    first 57 characters of the line below it, and the character count is on
    page one, where it is what a reader uses to decide whether to turn to the
    end: printing either here would be AGENTS §4.1's "said twice". The tool
    address a reader needs on this page is in its footer, which §2.2 puts on
    every page including this one.
    A qualifier the tool attached to its own permalink row travels here with
    the address it qualifies. */
 if(permaTrail){
  const seg=[];
  for(let i=0;i<permaS.length;i+=PERMA_SEG_MAX)seg.push(permaS.slice(i,i+PERMA_SEG_MAX));
  const m=seg.length;
  /* A segment title names the character range of the ADDRESS it holds, while
     page one counts the `s=` payload: 8 000 characters of address is 7 943 of
     payload plus the 57-character bare address, so a segment 2/2 holding 57
     characters reads as an error until both numbers are on the page. */
  seg.forEach((part,i)=>it.push('<div class="perma-trailer">'
   +'<div class="report-note-title">'+esc(tr("rPermaTrailer",l))
   +(m>1?' <span class="pt-seg">'+(i+1)+"/"+m+" \u00b7 "
      +reportNumber(i*PERMA_SEG_MAX+1,l)+"\u2013"+reportNumber(i*PERMA_SEG_MAX+part.length,l)
      +" / "+reportNumber(permaS.length,l)+'</span>':"")+'</div>'
   +'<div class="pt-url">'+esc(part)+'</div>'
   +(permaNote&&i===0?'<div class="pt-note">'+esc(permaNote)+'</div>':"")+'</div>'));
 }
 return it;
}
/* A record value may be a nested structure; keep the table cell readable.
   A tool that records its rooms, its connections or its load cases stores them
   as a list of objects, and printed as JSON that filled four rows of the sheet
   with {"id":"R1","name":"Schone pakhal","volume":1200,... truncated mid-key.
   A list is reported by what it contains: how many, and what they are called.
   The members belong in a table, which is what the tool's own sections are
   for. */
const NAMEKEYS=["name","label","title","id","key","tag","code"];
function listSummary(v,l){
 if(!Array.isArray(v))return null;
 if(!v.length)return "0";
 /* A polynomial's coefficients, a pole list, a sampled curve: every element a
    number. Joined with String() they carried binary tails and an English
    decimal point. Read the same way a repeated record key is read -- count and
    range -- and print short vectors in the document locale. */
 if(v.length&&v.every(x=>typeof x==="number"&&isFinite(x))){
  const lo=Math.min.apply(null,v),hi=Math.max.apply(null,v);
  if(v.length>=SERIESMIN)return tr("rSeries",l).replace("%n",String(v.length))
   .replace("%a",reportNumber(lo,l)).replace("%b",reportNumber(hi,l));
  return v.map(x=>reportNumber(x,l)).join(", ");
 }
 const names=[];
 for(const x of v){
  if(x==null)continue;
  if(typeof x!=="object"){names.push(String(x));continue}
  let n="";
  for(const k of NAMEKEYS)if(x[k]!==undefined&&x[k]!==""){n=String(x[k]);break}
  if(n)names.push(n);
 }
 if(names.length!==v.length)return String(v.length);
 let out=String(v.length)+" · ",joined=names.join(", ");
 if(joined.length>110)joined=names.slice(0,6).join(", ")+", …";
 return out+joined;
}
function fmtCell(v,l){
 if(v==null)return "";
 if(Array.isArray(v)){const s=listSummary(v,l);if(s!==null)return s}
 if(typeof v==="object"){try{const s=JSON.stringify(v);return s.length>160?s.slice(0,157)+"…":s}catch(e){return String(v)}}
 return String(v);
}
/* Quantity vocabulary for the report engine.
   Key: the record key as it appears in a tool's `units` map (or, where a tool
   builds its record dynamically, the static stem of that key).
   Built 2026-09-10 from 64 tool files fetched from tools.petrov.re (dgcRecord's
   units/inputs/outputs literals, plus the equivalent DGC_IN_UNITS/DGC_OUT_UNITS/
   DGC_UNITS-style maps some tools use instead); 888 keys, covering every key seen
   in 2+ tools plus a curated set of single-tool keys across all 12 categories,
   ~23% of all key occurrences site-wide (the rest is a long tail of ~1,400
   single-tool, single-occurrence identifiers). */
const QTYNAME = {
  A: [{u:["m2","mm2","cm2"], en:"Area", uk:"Площа", de:"Fläche", nl:"Oppervlakte", fr:"Aire", es:"Área", pl:"Powierzchnia"}],
  COP_cooling: {en:"Cooling COP", uk:"COP охолодження", de:"COP Kühlung", nl:"COP koeling", fr:"COP froid", es:"COP de refrigeración", pl:"COP chłodzenia"},
  COP_heating: {en:"Heating COP", uk:"COP опалення", de:"COP Heizung", nl:"COP verwarming", fr:"COP chauffage", es:"COP de calefacción", pl:"COP grzania"},
  C_star: {en:"Capacity ratio (C*)", uk:"Відношення теплоємностей (C*)", de:"Kapazitätsverhältnis (C*)", nl:"Capaciteitsverhouding (C*)", fr:"Rapport des capacités (C*)", es:"Relación de capacidades (C*)", pl:"Stosunek pojemności cieplnych (C*)"},
  Cd: {en:"Discharge coefficient", uk:"Коефіцієнт витрати", de:"Durchflusskoeffizient", nl:"Afvoercoëfficiënt", fr:"Coefficient de décharge", es:"Coeficiente de descarga", pl:"Współczynnik wypływu"},
  D: [{u:["m","mm","cm","in"], en:"Diameter", uk:"Діаметр", de:"Durchmesser", nl:"Diameter", fr:"Diamètre", es:"Diámetro", pl:"Średnica"}],
  Delta_D: {en:"Doppler width (ΔD)", uk:"Доплерівська ширина (ΔD)", de:"Doppler-Breite (ΔD)", nl:"Dopplerbreedte (ΔD)", fr:"Largeur Doppler (ΔD)", es:"Anchura Doppler (ΔD)", pl:"Szerokość dopplerowska (ΔD)"},
  E_mean_2kT: {en:"Mean flux energy (2kT)", uk:"Середня енергія потоку (2kT)", de:"Mittlere Flussenergie (2kT)", nl:"Gemiddelde fluxenergie (2kT)", fr:"Énergie moyenne du flux (2kT)", es:"Energía media del flujo (2kT)", pl:"Średnia energia strumienia (2kT)"},
  E_mean_maxwellian: {en:"Mean energy, Maxwellian", uk:"Середня енергія, максвелівський розподіл", de:"Mittlere Energie, Maxwell-Verteilung", nl:"Gemiddelde energie, Maxwell-verdeling", fr:"Énergie moyenne, distribution maxwellienne", es:"Energía media, distribución maxwelliana", pl:"Średnia energia, rozkład Maxwella"},
  E_mean_watt: {en:"Mean energy, Watt spectrum", uk:"Середня енергія, спектр Ватта", de:"Mittlere Energie, Watt-Spektrum", nl:"Gemiddelde energie, Watt-spectrum", fr:"Énergie moyenne, spectre de Watt", es:"Energía media, espectro de Watt", pl:"Średnia energia, widmo Watta"},
  E_most_probable: {en:"Most probable energy", uk:"Найімовірніша енергія", de:"Wahrscheinlichste Energie", nl:"Meest waarschijnlijke energie", fr:"Énergie la plus probable", es:"Energía más probable", pl:"Energia najbardziej prawdopodobna"},
  E_peak: {en:"Peak energy (E0)", uk:"Енергія піку (E0)", de:"Peak-Energie (E0)", nl:"Piekenergie (E0)", fr:"Énergie du pic (E0)", es:"Energía de pico (E0)", pl:"Energia piku (E0)"},
  E_peak_thermal_curve: {en:"Peak energy, thermal curve", uk:"Пікова енергія, теплова крива", de:"Peak-Energie, thermische Kurve", nl:"Piekenergie, thermische curve", fr:"Énergie de pic, courbe thermique", es:"Energía de pico, curva térmica", pl:"Energia piku, krzywa termiczna"},
  E_peak_watt_chi: {en:"Peak energy, Watt χ(E)", uk:"Пікова енергія, Watt χ(E)", de:"Peak-Energie, Watt χ(E)", nl:"Piekenergie, Watt χ(E)", fr:"Énergie de pic, χ(E) de Watt", es:"Energía de pico, χ(E) de Watt", pl:"Energia piku, χ(E) Watta"},
  E_peak_watt_lethargy: {en:"Peak energy, Watt per lethargy", uk:"Пікова енергія, Watt на летаргію", de:"Peak-Energie, Watt je Lethargie", nl:"Piekenergie, Watt per lethargie", fr:"Énergie de pic, Watt par léthargie", es:"Energía de pico, Watt por letargia", pl:"Energia piku, Watt na letargię"},
  F_factor: {en:"LMTD correction factor (F)", uk:"Поправковий коефіцієнт LMTD (F)", de:"LMTD-Korrekturfaktor (F)", nl:"LMTD-correctiefactor (F)", fr:"Facteur de correction LMTD (F)", es:"Factor de corrección LMTD (F)", pl:"Współczynnik korekcyjny LMTD (F)"},
  Gcrit: {en:"Critical mass flux", uk:"Критичний масовий потік", de:"Kritische Massenstromdichte", nl:"Kritische massaflux", fr:"Flux massique critique", es:"Flujo másico crítico", pl:"Krytyczny strumień masy"},
  I: [{u:"at/cm3", en:"Iodine-135 concentration", uk:"Концентрація йоду-135", de:"Iod-135-Konzentration", nl:"Jodium-135-concentratie", fr:"Concentration en iode 135", es:"Concentración de yodo-135", pl:"Stężenie jodu-135"}],
  I1: {en:"First stress invariant (I1)", uk:"Перший інваріант напружень (I1)", de:"Erste Spannungsinvariante (I1)", nl:"Eerste spanningsinvariant (I1)", fr:"Premier invariant des contraintes (I1)", es:"Primer invariante de tensiones (I1)", pl:"Pierwszy niezmiennik naprężeń (I1)"},
  IAE: {en:"IAE", uk:"IAE", de:"IAE", nl:"IAE", fr:"IAE", es:"IAE", pl:"IAE"},
  ISE: {en:"ISE", uk:"ISE", de:"ISE", nl:"ISE", fr:"ISE", es:"ISE", pl:"ISE"},
  ITAE: {en:"ITAE", uk:"ITAE", de:"ITAE", nl:"ITAE", fr:"ITAE", es:"ITAE", pl:"ITAE"},
  J2: {en:"Second deviatoric stress invariant (J2)", uk:"Другий девіаторний інваріант напружень (J2)", de:"Zweite deviatorische Spannungsinvariante (J2)", nl:"Tweede deviatorische spanningsinvariant (J2)", fr:"Deuxième invariant déviatorique des contraintes (J2)", es:"Segundo invariante desviador de tensiones (J2)", pl:"Drugi dewiatorowy niezmiennik naprężeń (J2)"},
  K: [{u:"-", en:"Loss coefficient", uk:"Коефіцієнт місцевого опору", de:"Verlustbeiwert", nl:"Verliescoëfficiënt", fr:"Coefficient de perte", es:"Coeficiente de pérdida", pl:"Współczynnik strat miejscowych"}],
  L: [{u:["m","mm","km"], en:"Length", uk:"Довжина", de:"Länge", nl:"Lengte", fr:"Longueur", es:"Longitud", pl:"Długość"}],
  LMTD: {en:"LMTD", uk:"LMTD", de:"LMTD", nl:"LMTD", fr:"LMTD", es:"LMTD", pl:"LMTD"},
  Lambda: {en:"Prompt-neutron generation time", uk:"Час життя миттєвих нейтронів", de:"Prompt-Neutronen-Generationszeit", nl:"Generatietijd prompte neutronen", fr:"Temps de génération des neutrons prompts", es:"Tiempo de generación de neutrones prontos", pl:"Czas generacji neutronów natychmiastowych"},
  M1: {en:"Upstream Mach number (M1)", uk:"Число Маха перед стрибком (M1)", de:"Machzahl stromauf (M1)", nl:"Machgetal voor de schok (M1)", fr:"Nombre de Mach amont (M1)", es:"Número de Mach aguas arriba (M1)", pl:"Liczba Macha przed skokiem (M1)"},
  M2: {en:"Downstream Mach number (M2)", uk:"Число Маха за стрибком (M2)", de:"Machzahl stromab (M2)", nl:"Machgetal na de schok (M2)", fr:"Nombre de Mach aval (M2)", es:"Número de Mach aguas abajo (M2)", pl:"Liczba Macha za skokiem (M2)"},
  M_in: {en:"Inlet Mach number", uk:"Число Маха на вході", de:"Mach-Zahl am Eintritt", nl:"Machgetal bij inlaat", fr:"Nombre de Mach à l'entrée", es:"Número de Mach de entrada", pl:"Liczba Macha na wlocie"},
  M_out: {en:"Outlet Mach number", uk:"Число Маха на виході", de:"Mach-Zahl am Austritt", nl:"Machgetal bij uitlaat", fr:"Nombre de Mach à la sortie", es:"Número de Mach de salida", pl:"Liczba Macha na wylocie"},
  M_subsonic: {en:"Subsonic-branch Mach number", uk:"Число Маха, дозвукова гілка", de:"Machzahl, Unterschall-Ast", nl:"Machgetal, subsone tak", fr:"Nombre de Mach, branche subsonique", es:"Número de Mach, rama subsónica", pl:"Liczba Macha, gałąź poddźwiękowa"},
  M_supersonic: {en:"Supersonic-branch Mach number", uk:"Число Маха, надзвукова гілка", de:"Machzahl, Überschall-Ast", nl:"Machgetal, supersone tak", fr:"Nombre de Mach, branche supersonique", es:"Número de Mach, rama supersónica", pl:"Liczba Macha, gałąź naddźwiękowa"},
  NTU: {en:"NTU", uk:"NTU", de:"NTU", nl:"NTU", fr:"NTU", es:"NTU", pl:"NTU"},
  Pr_cold: {en:"Cold-side Prandtl number", uk:"Число Прандтля, холодна сторона", de:"Prandtl-Zahl Kaltseite", nl:"Prandtlgetal koude zijde", fr:"Nombre de Prandtl côté froid", es:"Número de Prandtl lado frío", pl:"Liczba Prandtla, strona zimna"},
  Pr_hot: {en:"Hot-side Prandtl number", uk:"Число Прандтля, гаряча сторона", de:"Prandtl-Zahl Heißseite", nl:"Prandtlgetal warme zijde", fr:"Nombre de Prandtl côté chaud", es:"Número de Prandtl lado caliente", pl:"Liczba Prandtla, strona gorąca"},
  Q_bottom: {en:"Bottom boundary heat flow", uk:"Тепловий потік, нижній край", de:"Wärmestrom unterer Rand", nl:"Warmtestroom onderrand", fr:"Flux de chaleur bord inférieur", es:"Flujo de calor borde inferior", pl:"Strumień ciepła, dolna krawędź"},
  Q_fixed: {en:"Fixed-temperature heat flow", uk:"Тепловий потік при заданій температурі", de:"Wärmestrom bei fester Temperatur", nl:"Warmtestroom vaste temperatuur", fr:"Flux de chaleur à température imposée", es:"Flujo de calor a temperatura fija", pl:"Strumień ciepła przy stałej temperaturze"},
  Q_in: {en:"Inflow", uk:"Приплив", de:"Zuströmung", nl:"Instroom", fr:"Débit entrant", es:"Caudal entrante", pl:"Przepływ wpływający"},
  Q_left: {en:"Left boundary heat flow", uk:"Тепловий потік, лівий край", de:"Wärmestrom linker Rand", nl:"Warmtestroom linkerrand", fr:"Flux de chaleur bord gauche", es:"Flujo de calor borde izquierdo", pl:"Strumień ciepła, lewa krawędź"},
  Q_out: {en:"Outflow", uk:"Відтік", de:"Abströmung", nl:"Uitstroom", fr:"Débit sortant", es:"Caudal saliente", pl:"Przepływ wypływający"},
  Q_residual: {en:"Heat balance residual", uk:"Нев'язка теплового балансу", de:"Residuum der Wärmebilanz", nl:"Residu warmtebalans", fr:"Résidu du bilan thermique", es:"Residuo del balance térmico", pl:"Residuum bilansu cieplnego"},
  Q_right: {en:"Right boundary heat flow", uk:"Тепловий потік, правий край", de:"Wärmestrom rechter Rand", nl:"Warmtestroom rechterrand", fr:"Flux de chaleur bord droit", es:"Flujo de calor borde derecho", pl:"Strumień ciepła, prawa krawędź"},
  Q_surface: {en:"Surface heat flow", uk:"Тепловий потік з поверхні", de:"Wärmestrom an der Oberfläche", nl:"Warmtestroom oppervlak", fr:"Flux de chaleur en surface", es:"Flujo de calor superficial", pl:"Strumień ciepła z powierzchni"},
  Q_top: {en:"Top boundary heat flow", uk:"Тепловий потік, верхній край", de:"Wärmestrom oberer Rand", nl:"Warmtestroom bovenrand", fr:"Flux de chaleur bord supérieur", es:"Flujo de calor borde superior", pl:"Strumień ciepła, górna krawędź"},
  R: [{u:["J/(kg.K)","kJ/(kg.K)"], en:"Specific gas constant", uk:"Питома газова стала", de:"Spezifische Gaskonstante", nl:"Specifieke gasconstante", fr:"Constante spécifique du gaz", es:"Constante específica del gas", pl:"Indywidualna stała gazowa"}, {u:["m2.K/W","m2K/W"], en:"Thermal resistance", uk:"Термічний опір", de:"Wärmewiderstand", nl:"Warmteweerstand", fr:"Résistance thermique", es:"Resistencia térmica", pl:"Opór cieplny"}, {u:["m","mm"], en:"Radius", uk:"Радіус", de:"Radius", nl:"Straal", fr:"Rayon", es:"Radio", pl:"Promień"}],
  R_T: {en:"Total thermal resistance (RT)", uk:"Загальний опір теплопередачі (RT)", de:"Gesamtwärmedurchlasswiderstand (RT)", nl:"Totale warmteweerstand (RT)", fr:"Résistance thermique totale (RT)", es:"Resistencia térmica total (RT)", pl:"Całkowity opór cieplny (RT)"},
  R_cold: {en:"Cold-side thermal resistance", uk:"Термічний опір, холодна сторона", de:"Wärmewiderstand Kaltseite", nl:"Warmteweerstand koude zijde", fr:"Résistance thermique côté froid", es:"Resistencia térmica lado frío", pl:"Opór cieplny, strona zimna"},
  R_hot: {en:"Hot-side thermal resistance", uk:"Термічний опір, гаряча сторона", de:"Wärmewiderstand Heißseite", nl:"Warmteweerstand warme zijde", fr:"Résistance thermique côté chaud", es:"Resistencia térmica lado caliente", pl:"Opór cieplny, strona gorąca"},
  R_se: {en:"External surface resistance (Rse)", uk:"Опір тепловіддачі зовнішньої поверхні (Rse)", de:"Äußerer Wärmeübergangswiderstand (Rse)", nl:"Uitwendige overgangsweerstand (Rse)", fr:"Résistance superficielle extérieure (Rse)", es:"Resistencia superficial exterior (Rse)", pl:"Opór przejmowania ciepła zewnętrzny (Rse)"},
  R_si: {en:"Internal surface resistance (Rsi)", uk:"Опір тепловіддачі внутрішньої поверхні (Rsi)", de:"Innerer Wärmeübergangswiderstand (Rsi)", nl:"Inwendige overgangsweerstand (Rsi)", fr:"Résistance superficielle intérieure (Rsi)", es:"Resistencia superficial interior (Rsi)", pl:"Opór przejmowania ciepła wewnętrzny (Rsi)"},
  R_specific: {en:"Specific gas constant", uk:"Питома газова стала", de:"Spezifische Gaskonstante", nl:"Specifieke gasconstante", fr:"Constante spécifique du gaz", es:"Constante específica del gas", pl:"Indywidualna stała gazowa"},
  R_wall: {en:"Wall thermal resistance", uk:"Термічний опір стінки", de:"Wärmewiderstand der Wand", nl:"Warmteweerstand wand", fr:"Résistance thermique de la paroi", es:"Resistencia térmica de la pared", pl:"Opór cieplny ścianki"},
  Rc: {en:"Contact resistance (Rc)", uk:"Контактний опір (Rc)", de:"Kontaktwiderstand (Rc)", nl:"Contactweerstand (Rc)", fr:"Résistance de contact (Rc)", es:"Resistencia de contacto (Rc)", pl:"Opór kontaktowy (Rc)"},
  Re_cold: {en:"Cold-side Reynolds number", uk:"Число Рейнольдса, холодна сторона", de:"Reynolds-Zahl Kaltseite", nl:"Reynoldsgetal koude zijde", fr:"Nombre de Reynolds côté froid", es:"Número de Reynolds lado frío", pl:"Liczba Reynoldsa, strona zimna"},
  Re_hot: {en:"Hot-side Reynolds number", uk:"Число Рейнольдса, гаряча сторона", de:"Reynolds-Zahl Heißseite", nl:"Reynoldsgetal warme zijde", fr:"Nombre de Reynolds côté chaud", es:"Número de Reynolds lado caliente", pl:"Liczba Reynoldsa, strona gorąca"},
  T: [{u:["degC","K","°C","degF"], en:"Temperature", uk:"Температура", de:"Temperatur", nl:"Temperatuur", fr:"Température", es:"Temperatura", pl:"Temperatura"}],
  T0: {en:"Initial temperature", uk:"Початкова температура", de:"Anfangstemperatur", nl:"Begintemperatuur", fr:"Température initiale", es:"Temperatura inicial", pl:"Temperatura początkowa"},
  T0_out: {en:"Stagnation temperature, outlet", uk:"Температура гальмування на виході", de:"Ruhetemperatur am Austritt", nl:"Stagnatietemperatuur uitlaat", fr:"Température d'arrêt en sortie", es:"Temperatura de remanso en salida", pl:"Temperatura spiętrzenia na wylocie"},
  T0_ratio: {en:"Stagnation-temperature ratio", uk:"Відношення температур гальмування", de:"Ruhetemperaturverhältnis", nl:"Stagnatietemperatuurverhouding", fr:"Rapport des températures d'arrêt", es:"Relación de temperaturas de remanso", pl:"Stosunek temperatur spiętrzenia"},
  T_T0_subsonic: {en:"T/T0, subsonic branch", uk:"T/T0, дозвукова гілка", de:"T/T0, Unterschall-Ast", nl:"T/T0, subsone tak", fr:"T/T0, branche subsonique", es:"T/T0, rama subsónica", pl:"T/T0, gałąź poddźwiękowa"},
  T_T0_supersonic: {en:"T/T0, supersonic branch", uk:"T/T0, надзвукова гілка", de:"T/T0, Überschall-Ast", nl:"T/T0, supersone tak", fr:"T/T0, branche supersonique", es:"T/T0, rama supersónica", pl:"T/T0, gałąź naddźwiękowa"},
  T_ambient: {en:"Ambient temperature", uk:"Температура навколишнього середовища", de:"Umgebungstemperatur", nl:"Omgevingstemperatuur", fr:"Température ambiante", es:"Temperatura ambiente", pl:"Temperatura otoczenia"},
  T_cold_in: {en:"Cold-side inlet temperature", uk:"Температура холодного теплоносія на вході", de:"Eintrittstemperatur Kaltseite", nl:"Intredetemperatuur koude zijde", fr:"Température d'entrée côté froid", es:"Temperatura de entrada lado frío", pl:"Temperatura wlotowa, strona zimna"},
  T_cold_out: {en:"Cold-side outlet temperature", uk:"Температура холодного теплоносія на виході", de:"Austrittstemperatur Kaltseite", nl:"Uittredetemperatuur koude zijde", fr:"Température de sortie côté froid", es:"Temperatura de salida lado frío", pl:"Temperatura wylotowa, strona zimna"},
  T_final: {en:"Final temperature", uk:"Кінцева температура", de:"Endtemperatur", nl:"Eindtemperatuur", fr:"Température finale", es:"Temperatura final", pl:"Temperatura końcowa"},
  T_fuel: {en:"Fuel temperature", uk:"Температура палива", de:"Brennstofftemperatur", nl:"Splijtstoftemperatuur", fr:"Température du combustible", es:"Temperatura del combustible", pl:"Temperatura paliwa"},
  T_hot_in: {en:"Hot-side inlet temperature", uk:"Температура гарячого теплоносія на вході", de:"Eintrittstemperatur Heißseite", nl:"Intredetemperatuur warme zijde", fr:"Température d'entrée côté chaud", es:"Temperatura de entrada lado caliente", pl:"Temperatura wlotowa, strona gorąca"},
  T_hot_out: {en:"Hot-side outlet temperature", uk:"Температура гарячого теплоносія на виході", de:"Austrittstemperatur Heißseite", nl:"Uittredetemperatuur warme zijde", fr:"Température de sortie côté chaud", es:"Temperatura de salida lado caliente", pl:"Temperatura wylotowa, strona gorąca"},
  T_in: {en:"Inlet temperature", uk:"Температура на вході", de:"Eintrittstemperatur", nl:"Intredetemperatuur", fr:"Température d'entrée", es:"Temperatura de entrada", pl:"Temperatura na wlocie"},
  T_initial: {en:"Initial temperature", uk:"Початкова температура", de:"Anfangstemperatur", nl:"Begintemperatuur", fr:"Température initiale", es:"Temperatura inicial", pl:"Temperatura początkowa"},
  T_max: {en:"Maximum temperature", uk:"Максимальна температура", de:"Maximaltemperatur", nl:"Maximale temperatuur", fr:"Température maximale", es:"Temperatura máxima", pl:"Temperatura maksymalna"},
  T_mean: {en:"Mean temperature", uk:"Середня температура", de:"Mittlere Temperatur", nl:"Gemiddelde temperatuur", fr:"Température moyenne", es:"Temperatura media", pl:"Średnia temperatura"},
  T_min: {en:"Minimum temperature", uk:"Мінімальна температура", de:"Minimaltemperatur", nl:"Minimale temperatuur", fr:"Température minimale", es:"Temperatura mínima", pl:"Temperatura minimalna"},
  T_mod: {en:"Moderator temperature", uk:"Температура сповільнювача", de:"Moderatortemperatur", nl:"Moderatortemperatuur", fr:"Température du modérateur", es:"Temperatura del moderador", pl:"Temperatura moderatora"},
  T_out: {en:"Outlet temperature", uk:"Температура на виході", de:"Austrittstemperatur", nl:"Uittredetemperatuur", fr:"Température de sortie", es:"Temperatura de salida", pl:"Temperatura na wylocie"},
  T_outdoor: {en:"Outdoor temperature", uk:"Температура зовнішнього повітря", de:"Außentemperatur", nl:"Buitentemperatuur", fr:"Température extérieure", es:"Temperatura exterior", pl:"Temperatura zewnętrzna"},
  T_start: {en:"Initial air temperature", uk:"Початкова температура повітря", de:"Anfängliche Lufttemperatur", nl:"Initiële luchttemperatuur", fr:"Température d'air initiale", es:"Temperatura de aire inicial", pl:"Początkowa temperatura powietrza"},
  Tamb: {en:"Ambient temperature", uk:"Температура навколишнього середовища", de:"Umgebungstemperatur", nl:"Omgevingstemperatuur", fr:"Température ambiante", es:"Temperatura ambiente", pl:"Temperatura otoczenia"},
  Tc: {en:"Coolant temperature (Tc)", uk:"Температура теплоносія (Tc)", de:"Kühlmitteltemperatur (Tc)", nl:"Koelmiddeltemperatuur (Tc)", fr:"Température du caloporteur (Tc)", es:"Temperatura del refrigerante (Tc)", pl:"Temperatura chłodziwa (Tc)"},
  Tf: {en:"Fuel temperature (Tf)", uk:"Температура палива (Tf)", de:"Brennstofftemperatur (Tf)", nl:"Splijtstoftemperatuur (Tf)", fr:"Température du combustible (Tf)", es:"Temperatura del combustible (Tf)", pl:"Temperatura paliwa (Tf)"},
  Twall0: {en:"Initial wall temperature", uk:"Початкова температура стінки", de:"Anfangswandtemperatur", nl:"Beginwandtemperatuur", fr:"Température initiale de paroi", es:"Temperatura inicial de la pared", pl:"Początkowa temperatura ścianki"},
  Twall_final: {en:"Final wall temperature", uk:"Кінцева температура стінки", de:"Endwandtemperatur", nl:"Eindwandtemperatuur", fr:"Température finale de paroi", es:"Temperatura final de la pared", pl:"Końcowa temperatura ścianki"},
  U: [{u:["W/(m2.K)","W/m2K"], en:"U-value", uk:"Коефіцієнт теплопередачі (U)", de:"U-Wert", nl:"U-waarde", fr:"Coefficient U", es:"Transmitancia térmica (U)", pl:"Współczynnik przenikania ciepła (U)"}, {u:["kJ/kg","J/kg"], en:"Specific internal energy", uk:"Питома внутрішня енергія", de:"Spezifische innere Energie", nl:"Specifieke inwendige energie", fr:"Énergie interne massique", es:"Energía interna específica", pl:"Energia wewnętrzna właściwa"}],
  UAamb: {en:"Wall-to-ambient UA (UAamb)", uk:"UA стінка-довкілля (UAamb)", de:"UA Wand-Umgebung (UAamb)", nl:"UA wand-omgeving (UAamb)", fr:"UA paroi-ambiance (UAamb)", es:"UA pared-ambiente (UAamb)", pl:"UA ścianka-otoczenie (UAamb)"},
  UAin: {en:"Vessel-to-wall UA (UAin)", uk:"UA посудина-стінка (UAin)", de:"UA Behälter-Wand (UAin)", nl:"UA vat-wand (UAin)", fr:"UA cuve-paroi (UAin)", es:"UA recipiente-pared (UAin)", pl:"UA zbiornik-ścianka (UAin)"},
  U_envelope: {en:"Envelope U-value", uk:"Коефіцієнт теплопередачі огородження", de:"U-Wert der Gebäudehülle", nl:"U-waarde gebouwschil", fr:"Coefficient U de l'enveloppe", es:"Valor U de la envolvente", pl:"Współczynnik U przegrody"},
  U_incl_bridges: {en:"U-value incl. thermal bridges (Uc)", uk:"Коефіцієнт U з урахуванням містків холоду (Uc)", de:"U-Wert inkl. Wärmebrücken (Uc)", nl:"U-waarde incl. koudebruggen (Uc)", fr:"Coefficient U avec ponts thermiques (Uc)", es:"Coeficiente U con puentes térmicos (Uc)", pl:"Współczynnik U z mostkami cieplnymi (Uc)"},
  V: [{u:["m3","l","dm3"], en:"Volume", uk:"Об'єм", de:"Volumen", nl:"Volume", fr:"Volume", es:"Volumen", pl:"Objętość"}, {u:["V","kV"], en:"Voltage", uk:"Напруга", de:"Spannung", nl:"Spanning", fr:"Tension", es:"Tensión", pl:"Napięcie"}, {u:["m3/s","m3/h"], en:"Volume flow", uk:"Об'ємна витрата", de:"Volumenstrom", nl:"Volumedebiet", fr:"Débit volumique", es:"Caudal volumétrico", pl:"Strumień objętości"}],
  absorbed_power: {en:"Absorbed power", uk:"Поглинута потужність", de:"Absorbierte Leistung", nl:"Geabsorbeerd vermogen", fr:"Puissance absorbée", es:"Potencia absorbida", pl:"Moc pochłonięta"},
  activity_level: {en:"Activity level", uk:"Рівень фізичної активності", de:"Aktivitätsgrad", nl:"Activiteitsniveau", fr:"Niveau d'activité", es:"Nivel de actividad", pl:"Poziom aktywności"},
  actuator_reversals: {en:"Actuator reversals", uk:"Реверси виконавчого механізму", de:"Richtungswechsel des Stellantriebs", nl:"Omkeringen actuator", fr:"Inversions de l'actionneur", es:"Inversiones del actuador", pl:"Nawroty siłownika"},
  actuator_travel: {en:"Actuator travel", uk:"Хід виконавчого механізму", de:"Stellantriebsweg", nl:"Actuatorslag", fr:"Course de l'actionneur", es:"Recorrido del actuador", pl:"Skok siłownika"},
  adiabatic_effectiveness: {en:"Adiabatic effectiveness", uk:"Ефективність адіабатичного охолодження", de:"Wirkungsgrad der adiabaten Kühlung", nl:"Rendement adiabatische koeling", fr:"Efficacité du refroidissement adiabatique", es:"Eficacia del enfriamiento adiabático", pl:"Sprawność chłodzenia adiabatycznego"},
  adiabatic_supply_humidity_ratio: {en:"Adiabatic supply humidity ratio", uk:"Вологовміст подачі після адіабатичного охолодження", de:"Zuluftfeuchte nach adiabater Kühlung", nl:"Toevoervochtverhouding na adiabatische koeling", fr:"Teneur en eau de soufflage adiabatique", es:"Contenido de humedad de impulsión adiabática", pl:"Zawartość wilgoci nawiewu po chłodzeniu adiabatycznym"},
  adiabatic_supply_temperature: {en:"Adiabatic supply temperature", uk:"Температура подачі після адіабатичного охолодження", de:"Zulufttemperatur nach adiabater Kühlung", nl:"Toevoertemperatuur na adiabatische koeling", fr:"Température de soufflage adiabatique", es:"Temperatura de impulsión adiabática", pl:"Temperatura nawiewu po chłodzeniu adiabatycznym"},
  aerodynamic_area_equal_inlet: {en:"Aerodynamic area, inlet-limited", uk:"Аеродинамічна площа, обмежена припливом", de:"Aerodynamische Fläche, zuluftbegrenzt", nl:"Aerodynamische oppervlakte bij gelijke toevoer", fr:"Surface aérodynamique à amenée d'air égale", es:"Superficie aerodinámica con entrada de aire igual", pl:"Powierzchnia aerodynamiczna przy równym dopływie"},
  aerodynamic_inlet_area: {en:"Aerodynamic inlet area", uk:"Аеродинамічна площа припливу", de:"Aerodynamische Zuluftfläche", nl:"Aerodynamische toevoeroppervlakte", fr:"Surface aérodynamique d'amenée d'air", es:"Superficie aerodinámica de entrada de aire", pl:"Powierzchnia aerodynamiczna dopływu powietrza"},
  air_change: {en:"Air change rate", uk:"Кратність повітрообміну", de:"Luftwechselrate", nl:"Luchtwisseling", fr:"Taux de renouvellement d'air", es:"Tasa de renovación de aire", pl:"Krotność wymiany powietrza"},
  air_changes_per_hour: {en:"Air changes per hour", uk:"Кратність повітрообміну на годину", de:"Luftwechsel pro Stunde", nl:"Luchtwisselingen per uur", fr:"Renouvellements d'air par heure", es:"Renovaciones de aire por hora", pl:"Wymiany powietrza na godzinę"},
  air_density_kg_m3: {en:"Air density", uk:"Густина повітря", de:"Luftdichte", nl:"Luchtdichtheid", fr:"Masse volumique de l'air", es:"Densidad del aire", pl:"Gęstość powietrza"},
  air_residual_rel: {en:"Air balance residual", uk:"Нев'язка балансу повітря", de:"Residuum der Luftbilanz", nl:"Residu luchtbalans", fr:"Résidu du bilan d'air", es:"Residuo del balance de aire", pl:"Residuum bilansu powietrza"},
  air_temperature: {en:"Air temperature", uk:"Температура повітря", de:"Lufttemperatur", nl:"Luchttemperatuur", fr:"Température de l'air", es:"Temperatura del aire", pl:"Temperatura powietrza"},
  airflow: {en:"Airflow", uk:"Витрата повітря", de:"Luftvolumenstrom", nl:"Luchtdebiet", fr:"Débit d'air", es:"Caudal de aire", pl:"Przepływ powietrza"},
  allow_extrapolation: {en:"Extrapolation allowed", uk:"Дозволена екстраполяція", de:"Extrapolation zulässig", nl:"Extrapolatie toegestaan", fr:"Extrapolation autorisée", es:"Extrapolación permitida", pl:"Dopuszczalna ekstrapolacja"},
  alpha_cold: {en:"Cold-side film coefficient (α)", uk:"Коефіцієнт тепловіддачі, холодна сторона (α)", de:"Wärmeübergangskoeffizient Kaltseite (α)", nl:"Filmcoëfficiënt koude zijde (α)", fr:"Coefficient de film côté froid (α)", es:"Coeficiente de película lado frío (α)", pl:"Współczynnik przejmowania ciepła, strona zimna (α)"},
  alpha_hot: {en:"Hot-side film coefficient (α)", uk:"Коефіцієнт тепловіддачі, гаряча сторона (α)", de:"Wärmeübergangskoeffizient Heißseite (α)", nl:"Filmcoëfficiënt warme zijde (α)", fr:"Coefficient de film côté chaud (α)", es:"Coeficiente de película lado caliente (α)", pl:"Współczynnik przejmowania ciepła, strona gorąca (α)"},
  altitude: {en:"Altitude", uk:"Висота над рівнем моря", de:"Höhe über NN", nl:"Hoogte boven zeeniveau", fr:"Altitude", es:"Altitud", pl:"Wysokość nad poziomem morza"},
  ambient_temperature: {en:"Ambient temperature", uk:"Температура навколишнього середовища", de:"Umgebungstemperatur", nl:"Omgevingstemperatuur", fr:"Température ambiante", es:"Temperatura ambiente", pl:"Temperatura otoczenia"},
  amplitude_epithermal: {en:"Epithermal peak amplitude", uk:"Амплітуда епітеплового піку", de:"Amplitude des epithermischen Peaks", nl:"Amplitude epithermische piek", fr:"Amplitude du pic épithermique", es:"Amplitud del pico epitérmico", pl:"Amplituda piku epitermicznego"},
  amplitude_fast: {en:"Fast peak amplitude", uk:"Амплітуда швидкого піку", de:"Amplitude des schnellen Peaks", nl:"Amplitude snelle piek", fr:"Amplitude du pic rapide", es:"Amplitud del pico rápido", pl:"Amplituda piku szybkiego"},
  amplitude_thermal: {en:"Thermal peak amplitude", uk:"Амплітуда теплового піку", de:"Amplitude des thermischen Peaks", nl:"Amplitude thermische piek", fr:"Amplitude du pic thermique", es:"Amplitud del pico térmico", pl:"Amplituda piku termicznego"},
  annual_electricity: {en:"Annual electricity demand", uk:"Річне споживання електроенергії", de:"Jährlicher Strombedarf", nl:"Jaarlijks elektriciteitsverbruik", fr:"Consommation électrique annuelle", es:"Demanda eléctrica anual", pl:"Roczne zapotrzebowanie na energię elektryczną"},
  annual_heat: {en:"Annual heat demand", uk:"Річна потреба в теплі", de:"Jährlicher Wärmebedarf", nl:"Jaarlijkse warmtevraag", fr:"Besoin de chaleur annuel", es:"Demanda de calor anual", pl:"Roczne zapotrzebowanie na ciepło"},
  area: {en:"Area", uk:"Площа", de:"Fläche", nl:"Oppervlakte", fr:"Surface", es:"Área", pl:"Powierzchnia"},
  area_ratio: {en:"Area ratio", uk:"Відношення площ", de:"Flächenverhältnis", nl:"Oppervlakteverhouding", fr:"Rapport de sections", es:"Relación de áreas", pl:"Stosunek powierzchni"},
  arrangement: {en:"Flow arrangement", uk:"Схема руху теплоносіїв", de:"Strömungsanordnung", nl:"Stromingsconfiguratie", fr:"Configuration d'écoulement", es:"Configuración de flujo", pl:"Konfiguracja przepływu"},
  assembly_power: {en:"Assembly power", uk:"Потужність на збірку", de:"Leistung pro Brennelement", nl:"Vermogen per splijtstofelement", fr:"Puissance par assemblage", es:"Potencia por elemento combustible", pl:"Moc na zestaw paliwowy"},
  atomic_mass: {en:"Atomic mass", uk:"Атомна маса", de:"Atommasse", nl:"Atoommassa", fr:"Masse atomique", es:"Masa atómica", pl:"Masa atomowa"},
  background_material: {en:"Background material", uk:"Матеріал фону", de:"Hintergrundmaterial", nl:"Achtergrondmateriaal", fr:"Matériau de fond", es:"Material de fondo", pl:"Materiał tła"},
  backup_power: {en:"Backup power", uk:"Потужність резервного нагрівача", de:"Zusatzheizleistung", nl:"Vermogen bijverwarming", fr:"Puissance d'appoint", es:"Potencia de apoyo", pl:"Moc grzałki dodatkowej"},
  balance_residual: {en:"Heat balance residual", uk:"Нев'язка теплового балансу", de:"Residuum der Wärmebilanz", nl:"Residu warmtebalans", fr:"Résidu du bilan thermique", es:"Residuo del balance térmico", pl:"Residuum bilansu cieplnego"},
  barometric_pressure: {en:"Barometric pressure", uk:"Барометричний тиск", de:"Luftdruck", nl:"Barometrische druk", fr:"Pression barométrique", es:"Presión barométrica", pl:"Ciśnienie barometryczne"},
  beam_component: {en:"Beam irradiance component", uk:"Пряма складова опромінення", de:"Direkter Strahlungsanteil", nl:"Directe stralingscomponent", fr:"Composante directe du rayonnement", es:"Componente directa de la irradiancia", pl:"Składowa bezpośrednia napromieniowania"},
  beam_length: {en:"Beam length", uk:"Довжина балки", de:"Trägerlänge", nl:"Balklengte", fr:"Longueur de la poutre", es:"Longitud de la viga", pl:"Długość belki"},
  beta: [{u:"dimensionless", en:"Velocity ratio (β = v/c)", uk:"Відношення швидкостей (β = v/c)", de:"Geschwindigkeitsverhältnis (β = v/c)", nl:"Snelheidsverhouding (β = v/c)", fr:"Rapport de vitesse (β = v/c)", es:"Relación de velocidad (β = v/c)", pl:"Stosunek prędkości (β = v/c)"}],
  betaEff: {en:"Delayed-neutron fraction (βeff)", uk:"Частка запізнілих нейтронів (βeff)", de:"Anteil verzögerter Neutronen (βeff)", nl:"Fractie vertraagde neutronen (βeff)", fr:"Fraction de neutrons retardés (βeff)", es:"Fracción de neutrones retardados (βeff)", pl:"Udział neutronów opóźnionych (βeff)"},
  binding_energy_per_nucleon: {en:"Binding energy per nucleon", uk:"Енергія зв'язку на нуклон", de:"Bindungsenergie pro Nukleon", nl:"Bindingsenergie per nucleon", fr:"Énergie de liaison par nucléon", es:"Energía de enlace por nucleón", pl:"Energia wiązania na nukleon"},
  bivalent_coverage: {en:"Bivalent coverage", uk:"Бівалентний коефіцієнт покриття", de:"Bivalenter Deckungsgrad", nl:"Bivalente dekkingsgraad", fr:"Taux de couverture bivalent", es:"Cobertura bivalente", pl:"Stopień pokrycia biwalentnego"},
  bivalent_point: {en:"Bivalent point", uk:"Бівалентна точка", de:"Bivalenzpunkt", nl:"Bivalent punt", fr:"Point bivalent", es:"Punto bivalente", pl:"Punkt biwalentny"},
  bode_applicable: {en:"Bode margins applicable", uk:"Застосовність запасів Боде", de:"Bode-Ränder anwendbar", nl:"Bode-marges van toepassing", fr:"Marges de Bode applicables", es:"Márgenes de Bode aplicables", pl:"Zapasy Bode mają zastosowanie"},
  boiler_pressure: {en:"Boiler pressure", uk:"Тиск у котлі", de:"Kesseldruck", nl:"Keteldruk", fr:"Pression de chaudière", es:"Presión de caldera", pl:"Ciśnienie w kotle"},
  boundary_condition: {en:"Boundary condition", uk:"Гранична умова", de:"Randbedingung", nl:"Randvoorwaarde", fr:"Condition aux limites", es:"Condición de contorno", pl:"Warunek brzegowy"},
  breaking_current_A: {en:"Breaking current", uk:"Струм відключення", de:"Ausschaltstrom", nl:"Uitschakelstroom", fr:"Courant de coupure", es:"Corriente de corte", pl:"Prąd wyłączalny"},
  buckling_factors: {en:"Buckling factors", uk:"Коефіцієнти втрати стійкості", de:"Knickfaktoren", nl:"Knikfactoren", fr:"Facteurs de flambement", es:"Factores de pandeo", pl:"Współczynniki wyboczenia"},
  buffer_volume_advised: {en:"Advised buffer volume", uk:"Рекомендований об'єм буфера", de:"Empfohlenes Puffervolumen", nl:"Geadviseerd buffervolume", fr:"Volume tampon recommandé", es:"Volumen de depósito recomendado", pl:"Zalecana pojemność bufora"},
  buffer_volume_calculated: {en:"Calculated buffer volume", uk:"Розрахований об'єм буфера", de:"Berechnetes Puffervolumen", nl:"Berekend buffervolume", fr:"Volume tampon calculé", es:"Volumen de depósito calculado", pl:"Obliczona pojemność bufora"},
  burnup: {en:"Burnup", uk:"Вигоряння палива", de:"Abbrand", nl:"Uitbranding (splijtstof)", fr:"Taux de combustion", es:"Quemado (burnup)", pl:"Wypalenie paliwa"},
  cable_length: {en:"Cable length", uk:"Довжина кабелю", de:"Kabellänge", nl:"Kabellengte", fr:"Longueur de câble", es:"Longitud del cable", pl:"Długość kabla"},
  capacity_at_design: {en:"Capacity at design conditions", uk:"Потужність за розрахункових умов", de:"Leistung bei Auslegungsbedingungen", nl:"Vermogen bij ontwerpcondities", fr:"Puissance aux conditions de dimensionnement", es:"Capacidad en condiciones de diseño", pl:"Moc w warunkach projektowych"},
  capex_high: {en:"Investment, upper estimate", uk:"Капітальні витрати, верхня оцінка", de:"Investition, obere Schätzung", nl:"Investering, bovengrens", fr:"Investissement, estimation haute", es:"Inversión, estimación alta", pl:"Nakład inwestycyjny, oszacowanie górne"},
  capex_low: {en:"Investment, lower estimate", uk:"Капітальні витрати, нижня оцінка", de:"Investition, untere Schätzung", nl:"Investering, ondergrens", fr:"Investissement, estimation basse", es:"Inversión, estimación baja", pl:"Nakład inwestycyjny, oszacowanie dolne"},
  capex_mid: {en:"Investment, mid estimate", uk:"Капітальні витрати, середня оцінка", de:"Investition, mittlere Schätzung", nl:"Investering, middenraming", fr:"Investissement, estimation moyenne", es:"Inversión, estimación media", pl:"Nakład inwestycyjny, oszacowanie średnie"},
  capture_per_source_neutron: {en:"Capture per source neutron", uk:"Захоплення на нейтрон джерела", de:"Einfang je Quellneutron", nl:"Absorptie per bronneutron", fr:"Capture par neutron source", es:"Captura por neutrón fuente", pl:"Wychwyt na neutron źródłowy"},
  cavitation_reached: {en:"Cavitation reached", uk:"Досягнуто кавітації", de:"Kavitation erreicht", nl:"Cavitatie bereikt", fr:"Cavitation atteinte", es:"Cavitación alcanzada", pl:"Osiągnięto kawitację"},
  ceiling_height: {en:"Ceiling height", uk:"Висота стелі", de:"Deckenhöhe", nl:"Plafondhoogte", fr:"Hauteur sous plafond", es:"Altura del techo", pl:"Wysokość stropu"},
  cell_temperature: {en:"PV cell temperature", uk:"Температура фотоелемента", de:"PV-Zelltemperatur", nl:"PV-celtemperatuur", fr:"Température de cellule photovoltaïque", es:"Temperatura de célula fotovoltaica", pl:"Temperatura ogniwa PV"},
  cells: {en:"Cell count", uk:"Кількість комірок", de:"Anzahl Zellen", nl:"Aantal cellen", fr:"Nombre de cellules", es:"Número de celdas", pl:"Liczba komórek"},
  checks_advice: {en:"Advisory checks", uk:"Рекомендаційні перевірки", de:"Hinweise", nl:"Adviezen", fr:"Contrôles consultatifs", es:"Comprobaciones informativas", pl:"Kontrole doradcze"},
  checks_blocking: {en:"Blocking checks", uk:"Блокувальні перевірки", de:"Blockierende Prüfungen", nl:"Blokkerende controles", fr:"Contrôles bloquants", es:"Comprobaciones bloqueantes", pl:"Kontrole blokujące"},
  checks_passed: {en:"Checks passed", uk:"Пройдено перевірок", de:"Bestandene Prüfungen", nl:"Geslaagde controles", fr:"Contrôles réussis", es:"Comprobaciones superadas", pl:"Zaliczone kontrole"},
  checks_total: {en:"Checks, total", uk:"Перевірок усього", de:"Prüfungen gesamt", nl:"Controles totaal", fr:"Contrôles au total", es:"Comprobaciones en total", pl:"Kontrole łącznie"},
  checks_warning: {en:"Warning checks", uk:"Перевірки-попередження", de:"Warnhinweise", nl:"Waarschuwingen", fr:"Contrôles d'avertissement", es:"Comprobaciones de advertencia", pl:"Kontrole ostrzegawcze"},
  chiller_eer: {en:"Chiller EER", uk:"EER чилера", de:"EER des Kaltwassersatzes", nl:"EER van de koelmachine", fr:"EER du groupe froid", es:"EER de la enfriadora", pl:"EER agregatu chłodniczego"},
  choked: {en:"Choked flow", uk:"Критичний (задавлений) потік", de:"Verblockte Strömung", nl:"Verstopte stroming", fr:"Écoulement bloqué", es:"Flujo bloqueado", pl:"Przepływ zdławiony"},
  chosen_section_mm2: {en:"Chosen cross-section", uk:"Обраний переріз", de:"Gewählter Querschnitt", nl:"Gekozen doorsnede", fr:"Section choisie", es:"Sección elegida", pl:"Wybrany przekrój"},
  clear_sky_scale: {en:"Clear-sky scale factor", uk:"Масштабний коефіцієнт ясного неба", de:"Skalierungsfaktor wolkenloser Himmel", nl:"Schaalfactor heldere hemel", fr:"Facteur d'échelle ciel clair", es:"Factor de escala cielo despejado", pl:"Współczynnik skalujący niebo bezchmurne"},
  clearness_index: {en:"Clearness index", uk:"Індекс прозорості неба", de:"Klarheitsindex", nl:"Helderheidsindex", fr:"Indice de clarté", es:"Índice de claridad", pl:"Wskaźnik przejrzystości nieba"},
  climate_source: {en:"Climate data source", uk:"Джерело кліматичних даних", de:"Quelle der Klimadaten", nl:"Bron klimaatgegevens", fr:"Source des données climatiques", es:"Fuente de datos climáticos", pl:"Źródło danych klimatycznych"},
  closed_loop_den: {en:"Closed-loop denominator", uk:"Знаменник замкненого контуру", de:"Nenner des geschlossenen Kreises", nl:"Noemer gesloten kring", fr:"Dénominateur en boucle fermée", es:"Denominador en lazo cerrado", pl:"Mianownik układu zamkniętego"},
  closed_loop_poles_im: {en:"Closed-loop poles, imaginary part", uk:"Полюси замкненого контуру, уявна частина", de:"Pole des geschlossenen Kreises, Imaginärteil", nl:"Polen gesloten kring, imaginair deel", fr:"Pôles en boucle fermée, partie imaginaire", es:"Polos en lazo cerrado, parte imaginaria", pl:"Bieguny układu zamkniętego, część urojona"},
  closed_loop_poles_re: {en:"Closed-loop poles, real part", uk:"Полюси замкненого контуру, дійсна частина", de:"Pole des geschlossenen Kreises, Realteil", nl:"Polen gesloten kring, reëel deel", fr:"Pôles en boucle fermée, partie réelle", es:"Polos en lazo cerrado, parte real", pl:"Bieguny układu zamkniętego, część rzeczywista"},
  closed_loop_stable: {en:"Closed loop stable", uk:"Замкнений контур стійкий", de:"Geschlossener Kreis stabil", nl:"Gesloten kring stabiel", fr:"Boucle fermée stable", es:"Lazo cerrado estable", pl:"Układ zamknięty stabilny"},
  cloud_cover: {en:"Cloud cover", uk:"Хмарність", de:"Bewölkungsgrad", nl:"Bewolkingsgraad", fr:"Couverture nuageuse", es:"Nubosidad", pl:"Zachmurzenie"},
  cloud_fraction: {en:"Cloud fraction", uk:"Частка хмарного покриву", de:"Bewölkungsanteil", nl:"Bewolkingsfractie", fr:"Fraction nuageuse", es:"Fracción de nubosidad", pl:"Udział zachmurzenia"},
  co2_mean: {en:"Mean CO2 concentration", uk:"Середня концентрація CO2", de:"Mittlere CO2-Konzentration", nl:"Gemiddelde CO2-concentratie", fr:"Concentration moyenne de CO2", es:"Concentración media de CO2", pl:"Średnie stężenie CO2"},
  co2_outdoor: {en:"Outdoor CO2 concentration", uk:"Зовнішня концентрація CO2", de:"CO2-Konzentration außen", nl:"CO2-concentratie buiten", fr:"Concentration extérieure de CO2", es:"Concentración exterior de CO2", pl:"Stężenie CO2 na zewnątrz"},
  cold_fluid: {en:"Cold fluid", uk:"Холодний теплоносій", de:"Kaltes Fluid", nl:"Koud medium", fr:"Fluide froid", es:"Fluido frío", pl:"Czynnik zimny"},
  collecting_area: {en:"Collecting area", uk:"Приймальна площа", de:"Kollektorfläche", nl:"Opvangoppervlakte", fr:"Surface de captage", es:"Superficie de captación", pl:"Powierzchnia odbierająca"},
  command_travel: {en:"Command travel", uk:"Хід керуючого сигналу", de:"Stellsignalweg", nl:"Stuurslag", fr:"Course de commande", es:"Recorrido de la señal de mando", pl:"Skok sygnału sterującego"},
  comparison_period: {en:"Comparison period", uk:"Період порівняння", de:"Vergleichszeitraum", nl:"Vergelijkingsperiode", fr:"Période de comparaison", es:"Periodo de comparación", pl:"Okres porównawczy"},
  component_design_dp: {en:"Design pressure drop", uk:"Розрахунковий перепад тиску", de:"Auslegungs-Druckverlust", nl:"Ontwerpdrukval", fr:"Perte de charge de dimensionnement", es:"Caída de presión de diseño", pl:"Projektowy spadek ciśnienia"},
  component_design_flow: {en:"Design flow", uk:"Розрахункова витрата", de:"Auslegungsvolumenstrom", nl:"Ontwerpdebiet", fr:"Débit de dimensionnement", es:"Caudal de diseño", pl:"Przepływ projektowy"},
  component_diameter: {en:"Diameter", uk:"Діаметр", de:"Durchmesser", nl:"Diameter", fr:"Diamètre", es:"Diámetro", pl:"Średnica"},
  component_exponent: {en:"Flow exponent", uk:"Показник степеня витрати", de:"Durchflussexponent", nl:"Doorstroomexponent", fr:"Exposant de débit", es:"Exponente de caudal", pl:"Wykładnik przepływu"},
  component_law: {en:"Flow law", uk:"Закон витрати", de:"Durchflussgesetz", nl:"Doorstroomwet", fr:"Loi de débit", es:"Ley de caudal", pl:"Prawo przepływu"},
  component_length: {en:"Length", uk:"Довжина", de:"Länge", nl:"Lengte", fr:"Longueur", es:"Longitud", pl:"Długość"},
  component_opening: {en:"Opening", uk:"Відкриття", de:"Öffnung", nl:"Opening", fr:"Ouverture", es:"Apertura", pl:"Otwarcie"},
  component_rated_flow: {en:"Rated flow", uk:"Номінальна витрата", de:"Nenndurchfluss", nl:"Nominaal debiet", fr:"Débit nominal", es:"Caudal nominal", pl:"Przepływ znamionowy"},
  component_roughness: {en:"Roughness", uk:"Шорсткість", de:"Rauheit", nl:"Ruwheid", fr:"Rugosité", es:"Rugosidad", pl:"Chropowatość"},
  component_speed: {en:"Speed", uk:"Швидкість обертання", de:"Drehzahl", nl:"Toerental", fr:"Vitesse de rotation", es:"Velocidad de giro", pl:"Prędkość obrotowa"},
  component_type: {en:"Component type", uk:"Тип компонента", de:"Komponententyp", nl:"Componenttype", fr:"Type de composant", es:"Tipo de componente", pl:"Typ elementu"},
  composition_wt_pct: {en:"Heavy-metal composition (wt%)", uk:"Склад важких металів (мас. %)", de:"Schwermetallzusammensetzung (Gew.-%)", nl:"Samenstelling zware metalen (gew%)", fr:"Composition en métaux lourds (% massique)", es:"Composición de metales pesados (% en masa)", pl:"Skład metali ciężkich (% mas.)"},
  compression: {en:"Compression configuration", uk:"Конфігурація стиснення", de:"Verdichterkonfiguration", nl:"Compressieconfiguratie", fr:"Configuration de compression", es:"Configuración de compresión", pl:"Konfiguracja sprężania"},
  compressive_strength: {en:"Compressive strength", uk:"Міцність на стиск", de:"Druckfestigkeit", nl:"Druksterkte", fr:"Résistance à la compression", es:"Resistencia a la compresión", pl:"Wytrzymałość na ściskanie"},
  compressor_isentropic_efficiency: {en:"Compressor isentropic efficiency", uk:"Ізентропний ККД компресора", de:"Isentroper Verdichterwirkungsgrad", nl:"Isentropisch compressorrendement", fr:"Rendement isentropique du compresseur", es:"Rendimiento isentrópico del compresor", pl:"Sprawność izentropowa sprężarki"},
  compressor_power: {en:"Compressor power", uk:"Потужність компресора", de:"Verdichterleistung", nl:"Compressorvermogen", fr:"Puissance du compresseur", es:"Potencia del compresor", pl:"Moc sprężarki"},
  condensate: {en:"Condensate", uk:"Конденсат", de:"Kondensat", nl:"Condensaat", fr:"Condensat", es:"Condensado", pl:"Kondensat"},
  condensation_rate: {en:"Condensation rate", uk:"Швидкість конденсації", de:"Kondensationsrate", nl:"Condensatiesnelheid", fr:"Taux de condensation", es:"Tasa de condensación", pl:"Szybkość kondensacji"},
  condenser_heat: {en:"Condenser heat", uk:"Тепло конденсатора", de:"Kondensatorwärme", nl:"Condensorwarmte", fr:"Chaleur au condenseur", es:"Calor del condensador", pl:"Ciepło skraplacza"},
  condensing_temperature: {en:"Condensing temperature", uk:"Температура конденсації", de:"Kondensationstemperatur", nl:"Condensatietemperatuur", fr:"Température de condensation", es:"Temperatura de condensación", pl:"Temperatura kondensacji"},
  controller_function: {en:"Controller function", uk:"Функція регулятора", de:"Reglerfunktion", nl:"Regelaarfunctie", fr:"Fonction du régulateur", es:"Función del regulador", pl:"Funkcja regulatora"},
  convective_fraction: {en:"Convective fraction (α)", uk:"Конвективна частка (α)", de:"Konvektiver Anteil (α)", nl:"Convectief aandeel (α)", fr:"Fraction convective (α)", es:"Fracción convectiva (α)", pl:"Udział konwekcyjny (α)"},
  convective_heat: {en:"Convective heat release rate", uk:"Конвективна потужність тепловиділення", de:"Konvektive Wärmefreisetzungsrate", nl:"Convectief warmteafgiftevermogen", fr:"Puissance calorifique convective", es:"Potencia calorífica convectiva", pl:"Konwekcyjna moc pożaru"},
  cool_load: {en:"Cooling load", uk:"Холодильне навантаження", de:"Kühllast", nl:"Koellast", fr:"Charge frigorifique", es:"Carga de refrigeración", pl:"Obciążenie chłodnicze"},
  coolantRise: {en:"Coolant temperature rise", uk:"Підігрів теплоносія", de:"Kühlmittelaufheizung", nl:"Opwarming koelmiddel", fr:"Échauffement du caloporteur", es:"Calentamiento del refrigerante", pl:"Przyrost temperatury chłodziwa"},
  coolant_flow: {en:"Coolant flow, fraction nominal", uk:"Витрата теплоносія, частка номіналу", de:"Kühlmitteldurchfluss, Anteil Nennwert", nl:"Koelmiddeldebiet, fractie nominaal", fr:"Débit caloporteur, fraction nominale", es:"Caudal refrigerante, fracción nominal", pl:"Przepływ chłodziwa, ułamek nominalnego"},
  cooling_capacity: {en:"Cooling capacity", uk:"Холодопродуктивність", de:"Kälteleistung", nl:"Koelvermogen", fr:"Puissance frigorifique", es:"Capacidad de refrigeración", pl:"Moc chłodnicza"},
  cooling_coil_duty: {en:"Cooling coil duty", uk:"Теплове навантаження охолоджувача", de:"Kälteleistung des Kühlregisters", nl:"Koelvermogen koelbatterij", fr:"Puissance de la batterie froide", es:"Potencia de la batería de frío", pl:"Moc chłodnicy powietrza"},
  cooling_duty: {en:"Cooling duty", uk:"Холодопродуктивність", de:"Kälteleistung", nl:"Koelvermogen", fr:"Puissance frigorifique", es:"Potencia frigorífica", pl:"Moc chłodnicza"},
  cooling_electricity: {en:"Cooling electricity", uk:"Електроенергія охолодження", de:"Stromverbrauch der Kühlung", nl:"Elektriciteit koeling", fr:"Électricité du froid", es:"Electricidad de refrigeración", pl:"Energia elektryczna chłodzenia"},
  cooling_time: {en:"Cooling time", uk:"Час витримки", de:"Abklingzeit", nl:"Afkoeltijd", fr:"Temps de refroidissement", es:"Tiempo de enfriamiento", pl:"Czas chłodzenia"},
  cop_design: {en:"Design COP", uk:"Розрахунковий COP", de:"Auslegungs-COP", nl:"Ontwerp-COP", fr:"COP de dimensionnement", es:"COP de diseño", pl:"Projektowy COP"},
  cop_dhw: {en:"COP for DHW", uk:"COP для DHW", de:"COP für DHW", nl:"COP voor DHW", fr:"COP pour DHW", es:"COP para DHW", pl:"COP dla DHW"},
  cop_mild: {en:"COP at mild conditions", uk:"COP за помірних умов", de:"COP bei milden Bedingungen", nl:"COP bij milde omstandigheden", fr:"COP en conditions douces", es:"COP en condiciones suaves", pl:"COP w łagodnych warunkach"},
  cop_seasonal: {en:"Seasonal COP (SCOP)", uk:"Сезонний COP (SCOP)", de:"Jahresarbeitszahl (SCOP)", nl:"Seizoensgebonden COP (SCOP)", fr:"COP saisonnier (SCOP)", es:"COP estacional (SCOP)", pl:"Sezonowy COP (SCOP)"},
  corrected_ampacity_A: {en:"Corrected ampacity", uk:"Скоригована допустима струмове навантаження", de:"Korrigierte Strombelastbarkeit", nl:"Gecorrigeerde stroombelastbaarheid", fr:"Ampacité corrigée", es:"Ampacidad corregida", pl:"Skorygowana obciążalność prądowa"},
  country: {en:"Country", uk:"Країна", de:"Land", nl:"Land", fr:"Pays", es:"País", pl:"Kraj"},
  critical_extract_flow: {en:"Critical extract flow (plugholing)", uk:"Критична витрата витяжки (plug-holing)", de:"Kritischer Absaugvolumenstrom (Plug-Holing)", nl:"Kritisch afzuigdebiet (plugholing)", fr:"Débit d'extraction critique (effet de bouchon)", es:"Caudal de extracción crítico (efecto tapón)", pl:"Krytyczny przepływ wywiewu (efekt zatykania)"},
  critical_ventilator_area: {en:"Critical single-vent area limit", uk:"Критична межа площі одного вентилятора", de:"Kritischer Grenzwert je Rauchabzug", nl:"Kritische grens per rookluik", fr:"Limite critique par exutoire", es:"Límite crítico por exutorio", pl:"Krytyczny limit powierzchni klapy"},
  cycle_efficiency: {en:"Cycle efficiency", uk:"ККД циклу", de:"Kreislaufwirkungsgrad", nl:"Cyclusrendement", fr:"Rendement du cycle", es:"Rendimiento del ciclo", pl:"Sprawność cyklu"},
  cycle_family: {en:"Cycle family", uk:"Тип циклу", de:"Kreislaufart", nl:"Cyclusfamilie", fr:"Famille de cycle", es:"Familia de ciclo", pl:"Rodzina cyklu"},
  cycle_type: {en:"Cycle type", uk:"Різновид циклу", de:"Kreislauftyp", nl:"Cyclustype", fr:"Type de cycle", es:"Tipo de ciclo", pl:"Typ cyklu"},
  darcy_friction_factor: {en:"Darcy friction factor", uk:"Коефіцієнт тертя Дарсі", de:"Darcy-Reibungsbeiwert", nl:"Darcy-wrijvingsfactor", fr:"Coefficient de frottement de Darcy", es:"Factor de fricción de Darcy", pl:"Współczynnik tarcia Darcy'ego"},
  day: {en:"Day", uk:"День", de:"Tag", nl:"Dag", fr:"Jour", es:"Día", pl:"Dzień"},
  decay_constant: {en:"Decay constant", uk:"Стала розпаду", de:"Zerfallskonstante", nl:"Vervalconstante", fr:"Constante de désintégration", es:"Constante de desintegración", pl:"Stała rozpadu"},
  decay_heat: {en:"Decay heat", uk:"Залишкове тепловиділення", de:"Nachzerfallswärme", nl:"Vervalwarmte", fr:"Puissance résiduelle de désintégration", es:"Calor de desintegración", pl:"Ciepło powyłączeniowe"},
  decay_heat_alpha: {en:"Decay heat, alpha", uk:"Залишкове тепловиділення, альфа", de:"Nachzerfallswärme, Alpha", nl:"Nawarmte, alfa", fr:"Puissance résiduelle, alpha", es:"Calor residual, alfa", pl:"Ciepło powyłączeniowe, alfa"},
  decay_heat_beta: {en:"Decay heat, beta", uk:"Залишкове тепловиділення, бета", de:"Nachzerfallswärme, Beta", nl:"Nawarmte, bèta", fr:"Puissance résiduelle, bêta", es:"Calor residual, beta", pl:"Ciepło powyłączeniowe, beta"},
  decay_heat_gamma: {en:"Decay heat, gamma", uk:"Залишкове тепловиділення, гамма", de:"Nachzerfallswärme, Gamma", nl:"Nawarmte, gamma", fr:"Puissance résiduelle, gamma", es:"Calor residual, gamma", pl:"Ciepło powyłączeniowe, gamma"},
  decay_heat_spontaneous_fission: {en:"Decay heat, spontaneous fission", uk:"Залишкове тепловиділення, спонтанний поділ", de:"Nachzerfallswärme, Spontanspaltung", nl:"Nawarmte, spontane splijting", fr:"Puissance résiduelle, fission spontanée", es:"Calor residual, fisión espontánea", pl:"Ciepło powyłączeniowe, rozszczepienie spontaniczne"},
  decrement_factor: {en:"Decrement factor", uk:"Коефіцієнт загасання (декремент)", de:"Abminderungsfaktor", nl:"Decrementfactor", fr:"Facteur d'amortissement thermique", es:"Factor de amortiguación térmica", pl:"Współczynnik tłumienia (dekrement)"},
  defrost_volume: {en:"Defrost buffer volume", uk:"Об'єм буфера для розморожування", de:"Puffervolumen für Abtauung", nl:"Buffervolume ontdooien", fr:"Volume tampon de dégivrage", es:"Volumen de depósito para desescarche", pl:"Pojemność bufora do odszraniania"},
  delay_margin: {en:"Delay margin", uk:"Запас за запізненням", de:"Totzeitrand", nl:"Vertragingsmarge", fr:"Marge de retard", es:"Margen de retardo", pl:"Zapas opóźnienia"},
  density: {en:"Density", uk:"Густина", de:"Dichte", nl:"Dichtheid", fr:"Masse volumique", es:"Densidad", pl:"Gęstość"},
  density_rho: {en:"Density (ρ)", uk:"Густина (ρ)", de:"Dichte (ρ)", nl:"Dichtheid (ρ)", fr:"Masse volumique (ρ)", es:"Densidad (ρ)", pl:"Gęstość (ρ)"},
  depletion_steps: {en:"Depletion steps", uk:"Кроки вигоряння", de:"Abbrandschritte", nl:"Opbrandstappen", fr:"Pas de combustion", es:"Pasos de quemado", pl:"Kroki wypalania"},
  design_airflow: {en:"Design airflow", uk:"Розрахункова витрата повітря", de:"Auslegungsluftvolumenstrom", nl:"Ontwerpluchtdebiet", fr:"Débit d'air de dimensionnement", es:"Caudal de aire de diseño", pl:"Projektowy przepływ powietrza"},
  design_current_A: {en:"Design current", uk:"Розрахунковий струм", de:"Bemessungsstrom", nl:"Ontwerpstroom", fr:"Courant de dimensionnement", es:"Corriente de diseño", pl:"Prąd obliczeniowy"},
  design_margin: {en:"Design margin", uk:"Розрахунковий запас", de:"Auslegungsmarge", nl:"Ontwerpmarge", fr:"Marge de dimensionnement", es:"Margen de diseño", pl:"Zapas projektowy"},
  design_outdoor_dry_air_density: {en:"Design outdoor dry-air density", uk:"Розрахункова густина сухого зовнішнього повітря", de:"Auslegungsdichte trockene Außenluft", nl:"Ontwerpdichtheid droge buitenlucht", fr:"Masse volumique d'air sec extérieur de dimensionnement", es:"Densidad de aire seco exterior de diseño", pl:"Projektowa gęstość suchego powietrza zewnętrznego"},
  design_outdoor_dry_bulb: {en:"Design outdoor dry bulb", uk:"Розрахункова зовнішня температура (суха)", de:"Auslegungs-Außentemperatur (trocken)", nl:"Ontwerp buitentemperatuur (droge bol)", fr:"Température extérieure de dimensionnement (sèche)", es:"Temperatura exterior de diseño (bulbo seco)", pl:"Projektowa temperatura zewnętrzna (sucha)"},
  design_outdoor_humidity_ratio: {en:"Design outdoor humidity ratio", uk:"Розрахунковий вологовміст зовнішнього повітря", de:"Auslegungs-Wassergehalt Außenluft", nl:"Ontwerp vochtverhouding buitenlucht", fr:"Teneur en eau extérieure de dimensionnement", es:"Contenido de humedad exterior de diseño", pl:"Projektowa zawartość wilgoci powietrza zewnętrznego"},
  design_outdoor_wet_bulb: {en:"Design outdoor wet bulb", uk:"Розрахункова зовнішня температура (волога)", de:"Auslegungs-Außentemperatur (feucht)", nl:"Ontwerp buitentemperatuur (natte bol)", fr:"Température extérieure de dimensionnement (humide)", es:"Temperatura exterior de diseño (bulbo húmedo)", pl:"Projektowa temperatura zewnętrzna (mokra)"},
  design_return: {en:"Design return temperature", uk:"Розрахункова температура зворотної води", de:"Auslegungs-Rücklauftemperatur", nl:"Ontwerp retourtemperatuur", fr:"Température de retour de dimensionnement", es:"Temperatura de retorno de diseño", pl:"Projektowa temperatura powrotu"},
  design_supply: {en:"Design supply temperature", uk:"Розрахункова температура подачі", de:"Auslegungs-Vorlauftemperatur", nl:"Ontwerp aanvoertemperatuur", fr:"Température de départ de dimensionnement", es:"Temperatura de impulsión de diseño", pl:"Projektowa temperatura zasilania"},
  destination_absolute_pressure_Pa: {en:"Destination absolute pressure", uk:"Абсолютний тиск у точці призначення", de:"Absolutdruck am Zielpunkt", nl:"Absolute druk bij bestemming", fr:"Pression absolue au point d'arrivée", es:"Presión absoluta en el destino", pl:"Ciśnienie bezwzględne w punkcie docelowym"},
  destination_elevation_m: {en:"Destination elevation", uk:"Відмітка точки призначення", de:"Höhenlage Zielpunkt", nl:"Hoogteligging bestemming", fr:"Altitude du point d'arrivée", es:"Cota del punto de destino", pl:"Rzędna punktu docelowego"},
  dew_depth: {en:"Dew point depth", uk:"Глибина точки роси", de:"Tiefe des Taupunkts", nl:"Diepte van het dauwpunt", fr:"Profondeur du point de rosée", es:"Profundidad del punto de rocío", pl:"Głębokość punktu rosy"},
  dhi: {en:"Diffuse horizontal irradiance (DHI)", uk:"Розсіяне горизонтальне опромінення (DHI)", de:"Diffuse Horizontalstrahlung (DHI)", nl:"Diffuse horizontale straling (DHI)", fr:"Irradiance diffuse horizontale (DHI)", es:"Irradiancia difusa horizontal (DHI)", pl:"Napromieniowanie rozproszone poziome (DHI)"},
  dhw_annual_energy: {en:"Annual DHW energy", uk:"Річна енергія DHW", de:"Jährliche DHW-Energie", nl:"Jaarlijkse DHW-energie", fr:"Énergie DHW annuelle", es:"Energía DHW anual", pl:"Roczna energia DHW"},
  dhw_daily_energy: {en:"Daily DHW energy", uk:"Добова енергія DHW", de:"Tägliche DHW-Energie", nl:"Dagelijkse DHW-energie", fr:"Énergie DHW journalière", es:"Energía DHW diaria", pl:"Dobowa energia DHW"},
  dhw_daily_volume: {en:"Daily DHW volume", uk:"Добовий об'єм DHW", de:"Tägliches DHW-Volumen", nl:"Dagelijks DHW-volume", fr:"Volume DHW journalier", es:"Volumen diario de DHW", pl:"Dobowa objętość DHW"},
  diagram_axes: {en:"Diagram axes", uk:"Осі діаграми", de:"Diagrammachsen", nl:"Diagramassen", fr:"Axes du diagramme", es:"Ejes del diagrama", pl:"Osie wykresu"},
  diameter_inner: {en:"Inner diameter", uk:"Внутрішній діаметр", de:"Innendurchmesser", nl:"Binnendiameter", fr:"Diamètre intérieur", es:"Diámetro interior", pl:"Średnica wewnętrzna"},
  diameter_nominal_bore: {en:"Nominal bore diameter", uk:"Номінальний діаметр (DN)", de:"Nennweite (DN)", nl:"Nominale diameter (DN)", fr:"Diamètre nominal (DN)", es:"Diámetro nominal (DN)", pl:"Średnica nominalna (DN)"},
  diffuse_scale: {en:"Diffuse scale factor", uk:"Масштабний коефіцієнт розсіяного випромінювання", de:"Skalierungsfaktor diffuse Strahlung", nl:"Schaalfactor diffuse straling", fr:"Facteur d'échelle du rayonnement diffus", es:"Factor de escala de radiación difusa", pl:"Współczynnik skalujący promieniowanie rozproszone"},
  discharge_coefficient: {en:"Discharge coefficient", uk:"Коефіцієнт витрати", de:"Durchflusskoeffizient", nl:"Afvoercoëfficiënt", fr:"Coefficient de décharge", es:"Coeficiente de descarga", pl:"Współczynnik wypływu"},
  discharge_valve_open_percent: {en:"Discharge valve opening", uk:"Відкриття нагнітального клапана", de:"Öffnung Druckventil", nl:"Opening persklep", fr:"Ouverture vanne de refoulement", es:"Apertura de válvula de impulsión", pl:"Otwarcie zaworu tłocznego"},
  dni: {en:"Direct normal irradiance (DNI)", uk:"Пряме нормальне опромінення (DNI)", de:"Direkte Normalstrahlung (DNI)", nl:"Directe normale straling (DNI)", fr:"Irradiance directe normale (DNI)", es:"Irradiancia directa normal (DNI)", pl:"Napromieniowanie bezpośrednie normalne (DNI)"},
  dominant_mode_damping_ratio: {en:"Dominant mode damping ratio", uk:"Коефіцієнт демпфування домінантної моди", de:"Dämpfungsgrad der dominanten Mode", nl:"Dempingsverhouding dominante mode", fr:"Taux d'amortissement du mode dominant", es:"Relación de amortiguamiento del modo dominante", pl:"Współczynnik tłumienia mody dominującej"},
  dominant_mode_hz: {en:"Dominant mode frequency", uk:"Частота домінантної моди", de:"Frequenz der dominanten Mode", nl:"Frequentie dominante mode", fr:"Fréquence du mode dominant", es:"Frecuencia del modo dominante", pl:"Częstotliwość mody dominującej"},
  doppler: {en:"Relativistic Doppler scenario", uk:"Сценарій релятивістського ефекту Допплера", de:"Relativistisches Doppler-Szenario", nl:"Relativistisch dopplerscenario", fr:"Scénario Doppler relativiste", es:"Escenario Doppler relativista", pl:"Scenariusz relatywistycznego efektu Dopplera"},
  dose_distance: {en:"Dose distance", uk:"Відстань для оцінки дози", de:"Abstand für Dosisberechnung", nl:"Afstand voor dosisberekening", fr:"Distance de calcul de dose", es:"Distancia de cálculo de dosis", pl:"Odległość dla dawki"},
  dose_rate_gamma: {en:"Gamma dose rate", uk:"Потужність гамма-дози", de:"Gamma-Dosisleistung", nl:"Gamma-dosistempo", fr:"Débit de dose gamma", es:"Tasa de dosis gamma", pl:"Moc dawki gamma"},
  dose_rate_neutron: {en:"Neutron dose rate", uk:"Потужність нейтронної дози", de:"Neutronen-Dosisleistung", nl:"Neutronen-dosistempo", fr:"Débit de dose neutronique", es:"Tasa de dosis de neutrones", pl:"Moc dawki neutronowej"},
  dose_rate_total: {en:"Total dose rate", uk:"Сумарна потужність дози", de:"Gesamt-Dosisleistung", nl:"Totaal dosistempo", fr:"Débit de dose total", es:"Tasa de dosis total", pl:"Całkowita moc dawki"},
  dose_source_length: {en:"Assembly length (line source)", uk:"Довжина збірки (лінійне джерело)", de:"Länge des Brennelements (Linienquelle)", nl:"Lengte element (lijnbron)", fr:"Longueur de l'assemblage (source linéique)", es:"Longitud del elemento (fuente lineal)", pl:"Długość zestawu (źródło liniowe)"},
  doubling_or_halving_time: {en:"Doubling/halving time", uk:"Час подвоєння/зменшення вдвічі", de:"Verdopplungs-/Halbierungszeit", nl:"Verdubbelings-/halveringstijd", fr:"Temps de doublement ou de réduction de moitié", es:"Tiempo de duplicación o reducción a la mitad", pl:"Czas podwojenia/zmniejszenia o połowę"},
  dp: [{u:["Pa","kPa","bar","mbar"], en:"Pressure drop", uk:"Втрата тиску", de:"Druckverlust", nl:"Drukval", fr:"Perte de charge", es:"Pérdida de carga", pl:"Strata ciśnienia"}],
  dp_band_hi: {en:"Pressure drop, upper bound", uk:"Перепад тиску, верхня межа", de:"Druckverlust, Obergrenze", nl:"Drukval, bovengrens", fr:"Perte de charge, borne supérieure", es:"Caída de presión, límite superior", pl:"Spadek ciśnienia, górna granica"},
  dp_band_lo: {en:"Pressure drop, lower bound", uk:"Перепад тиску, нижня межа", de:"Druckverlust, Untergrenze", nl:"Drukval, ondergrens", fr:"Perte de charge, borne inférieure", es:"Caída de presión, límite inferior", pl:"Spadek ciśnienia, dolna granica"},
  dp_cold: {en:"Cold-side pressure drop", uk:"Перепад тиску, холодна сторона", de:"Druckverlust Kaltseite", nl:"Drukval koude zijde", fr:"Perte de charge côté froid", es:"Caída de presión lado frío", pl:"Spadek ciśnienia, strona zimna"},
  dp_elevation: {en:"Elevation pressure difference", uk:"Перепад тиску через різницю висот", de:"Druckunterschied durch Höhenlage", nl:"Drukverschil door hoogte", fr:"Différence de pression due au dénivelé", es:"Diferencia de presión por desnivel", pl:"Różnica ciśnień wynikająca z wysokości"},
  dp_friction: {en:"Friction pressure drop", uk:"Перепад тиску на тертя", de:"Reibungsdruckverlust", nl:"Drukval door wrijving", fr:"Perte de charge par frottement", es:"Caída de presión por fricción", pl:"Spadek ciśnienia na tarcie"},
  dp_hot: {en:"Hot-side pressure drop", uk:"Перепад тиску, гаряча сторона", de:"Druckverlust Heißseite", nl:"Drukval warme zijde", fr:"Perte de charge côté chaud", es:"Caída de presión lado caliente", pl:"Spadek ciśnienia, strona gorąca"},
  dp_total: {en:"Total pressure drop", uk:"Сумарний перепад тиску", de:"Gesamtdruckverlust", nl:"Totale drukval", fr:"Perte de charge totale", es:"Caída de presión total", pl:"Całkowity spadek ciśnienia"},
  dry_air_mass_flow: {en:"Dry air mass flow", uk:"Масова витрата сухого повітря", de:"Trockenluft-Massenstrom", nl:"Massadebiet droge lucht", fr:"Débit massique d'air sec", es:"Caudal másico de aire seco", pl:"Strumień masy suchego powietrza"},
  dt: {en:"Time step", uk:"Крок за часом", de:"Zeitschritt", nl:"Tijdstap", fr:"Pas de temps", es:"Paso de tiempo", pl:"Krok czasowy"},
  dtMax: {en:"Maximum time step", uk:"Максимальний часовий крок", de:"Maximale Zeitschrittweite", nl:"Maximale tijdstap", fr:"Pas de temps maximal", es:"Paso de tiempo máximo", pl:"Maksymalny krok czasowy"},
  dx: {en:"Spatial step", uk:"Просторовий крок", de:"Ortsschritt", nl:"Ruimtestap", fr:"Pas spatial", es:"Paso espacial", pl:"Krok przestrzenny"},
  early_reflection_count: {en:"Early reflection count", uk:"Кількість ранніх відбиттів", de:"Anzahl früher Reflexionen", nl:"Aantal vroege reflecties", fr:"Nombre de réflexions précoces", es:"Número de reflexiones tempranas", pl:"Liczba wczesnych odbić"},
  earth_fault_current_kA: {en:"Earth fault current", uk:"Струм замикання на землю", de:"Erdschlussstrom", nl:"Aardfoutstroom", fr:"Courant de défaut à la terre", es:"Corriente de falla a tierra", pl:"Prąd zwarcia doziemnego"},
  earthing: {en:"Earthing", uk:"Заземлення", de:"Erdung", nl:"Aarding", fr:"Mise à la terre", es:"Puesta a tierra", pl:"Uziemienie"},
  edge_bottom: {en:"Bottom edge condition", uk:"Гранична умова, нижня", de:"Randbedingung unten", nl:"Randvoorwaarde onder", fr:"Condition de bord inférieur", es:"Condición de contorno inferior", pl:"Warunek brzegowy, dolny"},
  edge_left: {en:"Left edge condition", uk:"Гранична умова, ліва", de:"Randbedingung links", nl:"Randvoorwaarde links", fr:"Condition de bord gauche", es:"Condición de contorno izquierda", pl:"Warunek brzegowy, lewy"},
  edge_right: {en:"Right edge condition", uk:"Гранична умова, права", de:"Randbedingung rechts", nl:"Randvoorwaarde rechts", fr:"Condition de bord droit", es:"Condición de contorno derecha", pl:"Warunek brzegowy, prawy"},
  edge_top: {en:"Top edge condition", uk:"Гранична умова, верхня", de:"Randbedingung oben", nl:"Randvoorwaarde boven", fr:"Condition de bord supérieur", es:"Condición de contorno superior", pl:"Warunek brzegowy, górny"},
  effectiveness: {en:"Effectiveness", uk:"Ефективність теплообмінника", de:"Wirkungsgrad", nl:"Effectiviteit", fr:"Efficacité", es:"Eficacia", pl:"Skuteczność wymiany ciepła"},
  efficiency: {en:"Pump efficiency at operating point", uk:"ККД насоса в робочій точці", de:"Pumpenwirkungsgrad im Betriebspunkt", nl:"Pomprendement in bedrijfspunt", fr:"Rendement de la pompe au point de fonctionnement", es:"Rendimiento de la bomba en el punto de funcionamiento", pl:"Sprawność pompy w punkcie pracy"},
  eigen_converged: {en:"Eigen-decomposition converged", uk:"Розкладання на власні значення збіглося", de:"Eigenwertzerlegung konvergiert", nl:"Eigenwaardenontbinding geconvergeerd", fr:"Décomposition propre convergée", es:"Descomposición propia convergida", pl:"Rozkład na wartości własne zbieżny"},
  eigen_orthogonality_error: {en:"Eigenvector orthogonality error", uk:"Похибка ортогональності власних векторів", de:"Orthogonalitätsfehler der Eigenvektoren", nl:"Orthogonaliteitsfout eigenvectoren", fr:"Erreur d'orthogonalité des vecteurs propres", es:"Error de ortogonalidad de vectores propios", pl:"Błąd ortogonalności wektorów własnych"},
  eigen_residual_relative: {en:"Eigenvalue residual (relative)", uk:"Нев'язка власних значень (відносна)", de:"Eigenwert-Residuum (relativ)", nl:"Residu eigenwaarden (relatief)", fr:"Résidu des valeurs propres (relatif)", es:"Residuo de valores propios (relativo)", pl:"Residuum wartości własnych (względne)"},
  elapsed: {en:"Elapsed time", uk:"Витрачений час", de:"Verstrichene Zeit", nl:"Verstreken tijd", fr:"Temps écoulé", es:"Tiempo transcurrido", pl:"Czas, jaki upłynął"},
  elastic_wave_speed: {en:"Elastic wave speed", uk:"Швидкість пружної хвилі", de:"Elastische Wellengeschwindigkeit", nl:"Elastische golfsnelheid", fr:"Célérité de l'onde élastique", es:"Velocidad de la onda elástica", pl:"Prędkość fali sprężystej"},
  electrical_power: {en:"Electrical power", uk:"Електрична потужність", de:"Elektrische Leistung", nl:"Elektrisch vermogen", fr:"Puissance électrique", es:"Potencia eléctrica", pl:"Moc elektryczna"},
  electrical_power_W: {en:"Electrical power draw", uk:"Споживана електрична потужність", de:"Elektrische Leistungsaufnahme", nl:"Elektrisch opgenomen vermogen", fr:"Puissance électrique absorbée", es:"Potencia eléctrica absorbida", pl:"Pobierana moc elektryczna"},
  electricity_tariff: {en:"Electricity tariff", uk:"Тариф на електроенергію", de:"Strompreis", nl:"Elektriciteitstarief", fr:"Tarif de l'électricité", es:"Tarifa eléctrica", pl:"Taryfa energii elektrycznej"},
  element_type: {en:"Element type", uk:"Тип конструкції", de:"Bauteiltyp", nl:"Type constructiedeel", fr:"Type d'élément", es:"Tipo de elemento", pl:"Typ przegrody"},
  elevation_dz: {en:"Elevation change (Δz)", uk:"Різниця висот (Δz)", de:"Höhenunterschied (Δz)", nl:"Hoogteverschil (Δz)", fr:"Dénivelé (Δz)", es:"Desnivel (Δz)", pl:"Różnica wysokości (Δz)"},
  emission: {en:"Emission pattern", uk:"Характер випромінювання", de:"Emissionsmuster", nl:"Emissiepatroon", fr:"Motif d'émission", es:"Patrón de emisión", pl:"Charakter emisji"},
  emission_exponent: {en:"Emission cosine exponent (n)", uk:"Показник косинуса випромінювання (n)", de:"Kosinus-Exponent der Emission (n)", nl:"Cosinusexponent emissie (n)", fr:"Exposant cosinus de l'émission (n)", es:"Exponente del coseno de emisión (n)", pl:"Wykładnik cosinusa emisji (n)"},
  emissivity: {en:"Emissivity", uk:"Ступінь чорноти", de:"Emissionsgrad", nl:"Emissiviteit", fr:"Émissivité", es:"Emisividad", pl:"Emisyjność"},
  end_of_cycle_flux: {en:"End-of-cycle flux", uk:"Потік наприкінці циклу", de:"Fluss am Zyklusende", nl:"Flux aan einde cyclus", fr:"Flux en fin de cycle", es:"Flujo al final del ciclo", pl:"Strumień na końcu cyklu"},
  energy: {en:"Energy", uk:"Енергія", de:"Energie", nl:"Energie", fr:"Énergie", es:"Energía", pl:"Energia"},
  energy_discharged: {en:"Energy discharged", uk:"Вивільнена енергія", de:"Abgeführte Energie", nl:"Afgevoerde energie", fr:"Énergie évacuée", es:"Energía liberada", pl:"Uwolniona energia"},
  energy_residual_rel: {en:"Energy balance residual", uk:"Нев'язка енергетичного балансу", de:"Residuum der Energiebilanz", nl:"Residu energiebalans", fr:"Résidu du bilan énergétique", es:"Residuo del balance energético", pl:"Residuum bilansu energii"},
  entropy_rise: {en:"Entropy rise", uk:"Приріст ентропії", de:"Entropiezunahme", nl:"Entropietoename", fr:"Augmentation d'entropie", es:"Aumento de entropía", pl:"Przyrost entropii"},
  envelope_gain: {en:"Envelope heat gain", uk:"Теплонадходження через огородження", de:"Wärmegewinn durch die Gebäudehülle", nl:"Warmtewinst via gebouwschil", fr:"Gain thermique par l'enveloppe", es:"Ganancia térmica por la envolvente", pl:"Zysk ciepła przez obudowę"},
  envelope_imbalance: {en:"Envelope imbalance", uk:"Небаланс огородження", de:"Ungleichgewicht der Gebäudehülle", nl:"Onbalans gebouwschil", fr:"Déséquilibre de l'enveloppe", es:"Desequilibrio de la envolvente", pl:"Niezbilansowanie obudowy"},
  envelope_net_flow: {en:"Envelope net flow", uk:"Чиста витрата через огородження", de:"Netto-Luftvolumenstrom Hülle", nl:"Netto debiet gebouwschil", fr:"Débit net de l'enveloppe", es:"Caudal neto de envolvente", pl:"Przepływ netto przez obudowę"},
  equation_of_time: {en:"Equation of time", uk:"Рівняння часу", de:"Zeitgleichung", nl:"Tijdsvereffening", fr:"Équation du temps", es:"Ecuación del tiempo", pl:"Równanie czasu"},
  equilibrium_hem_nozzle_used: {en:"Equilibrium HEM nozzle used", uk:"Використано рівноважну модель сопла HEM", de:"Gleichgewichts-HEM-Düse verwendet", nl:"Evenwichts-HEM-dyse gebruikt", fr:"Tuyère HEM à l'équilibre utilisée", es:"Tobera HEM en equilibrio usada", pl:"Zastosowano równowagowy model dyszy HEM"},
  evaporating_temperature: {en:"Evaporating temperature", uk:"Температура випаровування", de:"Verdampfungstemperatur", nl:"Verdampingstemperatuur", fr:"Température d'évaporation", es:"Temperatura de evaporación", pl:"Temperatura parowania"},
  event_A: {en:"Event A (x, ct)", uk:"Подія A (x, ct)", de:"Ereignis A (x, ct)", nl:"Gebeurtenis A (x, ct)", fr:"Événement A (x, ct)", es:"Suceso A (x, ct)", pl:"Zdarzenie A (x, ct)"},
  event_A_prime: {en:"Event A in S′", uk:"Подія A в S′", de:"Ereignis A in S′", nl:"Gebeurtenis A in S′", fr:"Événement A dans S′", es:"Suceso A en S′", pl:"Zdarzenie A w S′"},
  event_B: {en:"Event B (x, ct)", uk:"Подія B (x, ct)", de:"Ereignis B (x, ct)", nl:"Gebeurtenis B (x, ct)", fr:"Événement B (x, ct)", es:"Suceso B (x, ct)", pl:"Zdarzenie B (x, ct)"},
  event_B_prime: {en:"Event B in S′", uk:"Подія B в S′", de:"Ereignis B in S′", nl:"Gebeurtenis B in S′", fr:"Événement B dans S′", es:"Suceso B en S′", pl:"Zdarzenie B w S′"},
  exceedance_days: {en:"Exceedance days", uk:"Дні перевищення", de:"Überschreitungstage", nl:"Overschrijdingsdagen", fr:"Jours de dépassement", es:"Días de superación", pl:"Dni przekroczenia"},
  exchanger_type: {en:"Exchanger type", uk:"Тип теплообмінника", de:"Wärmeübertragertyp", nl:"Type warmtewisselaar", fr:"Type d'échangeur", es:"Tipo de intercambiador", pl:"Typ wymiennika"},
  exhaust_airflow: {en:"Exhaust airflow", uk:"Витрата витяжного повітря", de:"Abluftvolumenstrom", nl:"Afvoerluchtdebiet", fr:"Débit d'air extrait", es:"Caudal de aire de extracción", pl:"Strumień powietrza wywiewanego"},
  exhaust_fan_type: {en:"Exhaust fan type", uk:"Тип витяжного вентилятора", de:"Art des Abluftventilators", nl:"Type afzuigventilator", fr:"Type de ventilateur d'extraction", es:"Tipo de ventilador de extracción", pl:"Typ wentylatora wywiewnego"},
  exhaust_flow: {en:"Exhaust airflow", uk:"Витрата витяжного повітря", de:"Abluftvolumenstrom", nl:"Afvoerluchtdebiet", fr:"Débit d'air extrait", es:"Caudal de aire de extracción", pl:"Przepływ powietrza wywiewanego"},
  exhaust_mode: {en:"Exhaust mode", uk:"Режим витяжки", de:"Abluftmodus", nl:"Afvoermodus", fr:"Mode d'extraction", es:"Modo de extracción", pl:"Tryb wywiewu"},
  exhaust_quality: {en:"Exhaust steam quality", uk:"Сухість пари на виході", de:"Abdampfgehalt", nl:"Dampkwaliteit uitlaat", fr:"Titre de vapeur d'échappement", es:"Título del vapor de escape", pl:"Stopień suchości pary wylotowej"},
  exhaust_units: {en:"Exhaust units", uk:"Кількість витяжних установок", de:"Anzahl Abluftgeräte", nl:"Aantal afvoerunits", fr:"Nombre d'unités d'extraction", es:"Número de unidades de extracción", pl:"Liczba jednostek wywiewnych"},
  existing_extraction: {en:"Existing extraction rate", uk:"Наявна витяжка", de:"Vorhandene Abluftmenge", nl:"Bestaande afzuiging", fr:"Extraction existante", es:"Extracción existente", pl:"Istniejący wywiew"},
  expansion_volume: {en:"Expansion vessel volume", uk:"Об'єм розширювального бака", de:"Ausdehnungsgefäßvolumen", nl:"Volume expansievat", fr:"Volume du vase d'expansion", es:"Volumen del vaso de expansión", pl:"Pojemność naczynia wzbiorczego"},
  external_film_coefficient: {en:"External film coefficient", uk:"Зовнішній коефіцієнт тепловіддачі", de:"Äußerer Wärmeübergangskoeffizient", nl:"Uitwendige filmcoëfficiënt", fr:"Coefficient de convection extérieur", es:"Coeficiente de convección exterior", pl:"Zewnętrzny współczynnik przejmowania ciepła"},
  extra_flux: {en:"Extra heat flux", uk:"Додатковий тепловий потік", de:"Zusätzlicher Wärmestrom", nl:"Extra warmtestroom", fr:"Flux de chaleur supplémentaire", es:"Flujo de calor adicional", pl:"Dodatkowy strumień ciepła"},
  extra_heat_flux: {en:"Extra heat input", uk:"Додаткове тепловиділення", de:"Zusätzlicher Wärmeeintrag", nl:"Extra warmte-inbreng", fr:"Apport de chaleur supplémentaire", es:"Aporte de calor adicional", pl:"Dodatkowy dopływ ciepła"},
  fL_D_sonic: {en:"Sonic length parameter (fL*/D)", uk:"Параметр довжини до звукової точки (fL*/D)", de:"Sonischer Längenparameter (fL*/D)", nl:"Sonische lengteparameter (fL*/D)", fr:"Paramètre de longueur sonique (fL*/D)", es:"Parámetro de longitud sónica (fL*/D)", pl:"Parametr długości do warunków dźwiękowych (fL*/D)"},
  f_Rsi: {en:"Temperature factor (f_Rsi)", uk:"Температурний фактор (f_Rsi)", de:"Temperaturfaktor (f_Rsi)", nl:"Temperatuurfactor (f_Rsi)", fr:"Facteur de température (f_Rsi)", es:"Factor de temperatura (f_Rsi)", pl:"Współczynnik temperaturowy (f_Rsi)"},
  fan_electricity: {en:"Fan electricity", uk:"Електроенергія вентиляторів", de:"Stromverbrauch der Ventilatoren", nl:"Elektriciteit ventilatoren", fr:"Électricité des ventilateurs", es:"Electricidad de ventiladores", pl:"Energia elektryczna wentylatorów"},
  fast_hump: {en:"Fast-spectrum hump fraction", uk:"Частка швидкого горба спектра", de:"Anteil des schnellen Spektralhöckers", nl:"Aandeel snelle-spectrumpiek", fr:"Fraction de la bosse rapide", es:"Fracción del bulto rápido", pl:"Udział garbu szybkiego widma"},
  fault_current_A: {en:"Fault current", uk:"Струм короткого замикання", de:"Fehlerstrom", nl:"Foutstroom", fr:"Courant de défaut", es:"Corriente de falla", pl:"Prąd zwarciowy"},
  feasible: {en:"Feasible", uk:"Здійсненно", de:"Realisierbar", nl:"Haalbaar", fr:"Réalisable", es:"Viable", pl:"Wykonalne"},
  feedwater_heaters: {en:"Feedwater heaters", uk:"Кількість підігрівників живильної води", de:"Anzahl Speisewasservorwärmer", nl:"Aantal voedingwatervoorverwarmers", fr:"Nombre de réchauffeurs d'eau alimentaire", es:"Número de calentadores de agua de alimentación", pl:"Liczba podgrzewaczy wody zasilającej"},
  figure_of_merit: {en:"Figure of merit", uk:"Показник ефективності (FOM)", de:"Gütezahl (FOM)", nl:"Kwaliteitsgetal (FOM)", fr:"Facteur de mérite (FOM)", es:"Factor de mérito (FOM)", pl:"Wskaźnik jakości (FOM)"},
  final_vessel_vapour_quality: {en:"Final vapour quality", uk:"Кінцева сухість пари", de:"Endgültiger Dampfgehalt", nl:"Uiteindelijke dampkwaliteit", fr:"Titre vapeur final", es:"Título de vapor final", pl:"Końcowy stopień suchości pary"},
  fire_area: {en:"Fire area", uk:"Площа пожежі", de:"Brandfläche", nl:"Brandoppervlakte", fr:"Surface du foyer", es:"Superficie del incendio", pl:"Powierzchnia pożaru"},
  fire_perimeter: {en:"Fire perimeter", uk:"Периметр пожежі", de:"Brandumfang", nl:"Brandomtrek", fr:"Périmètre du foyer", es:"Perímetro del incendio", pl:"Obwód pożaru"},
  fission_per_source_neutron: {en:"Fissions per source neutron", uk:"Кількість поділів на нейтрон джерела", de:"Spaltungen pro Quellneutron", nl:"Splijtingen per bronneutron", fr:"Fissions par neutron source", es:"Fisiones por neutrón fuente", pl:"Liczba rozszczepień na neutron źródła"},
  fission_treatment: {en:"Fission treatment", uk:"Спосіб врахування поділу", de:"Behandlung der Spaltung", nl:"Behandeling van splijting", fr:"Traitement de la fission", es:"Tratamiento de la fisión", pl:"Sposób uwzględnienia rozszczepienia"},
  fixed_T: {en:"Fixed temperature", uk:"Задана температура", de:"Feste Temperatur", nl:"Vaste temperatuur", fr:"Température imposée", es:"Temperatura fija", pl:"Temperatura zadana"},
  floorArea: {en:"Floor area", uk:"Площа підлоги", de:"Grundfläche", nl:"Vloeroppervlakte", fr:"Surface de plancher", es:"Superficie de suelo", pl:"Powierzchnia podłogi"},
  floor_effective_area: {en:"Effective floor area", uk:"Ефективна площа підлоги", de:"Wirksame Fußbodenfläche", nl:"Effectieve vloeroppervlakte", fr:"Surface de plancher effective", es:"Superficie efectiva de suelo", pl:"Efektywna powierzchnia podłogi"},
  floor_heat_flux: {en:"Floor heat flux", uk:"Тепловий потік підлоги", de:"Wärmestromdichte Fußboden", nl:"Warmteflux vloer", fr:"Flux thermique du plancher", es:"Flujo de calor del suelo", pl:"Strumień ciepła podłogi"},
  floor_max_heat_flux: {en:"Maximum floor heat flux", uk:"Максимальний тепловий потік підлоги", de:"Maximale Wärmestromdichte Fußboden", nl:"Maximale warmteflux vloer", fr:"Flux thermique maximal du plancher", es:"Flujo de calor máximo del suelo", pl:"Maksymalny strumień ciepła podłogi"},
  floor_mean_water_temperature: {en:"Mean water temperature (floor)", uk:"Середня температура води (підлога)", de:"Mittlere Wassertemperatur (Fußboden)", nl:"Gemiddelde watertemperatuur (vloer)", fr:"Température moyenne d'eau (plancher)", es:"Temperatura media del agua (suelo)", pl:"Średnia temperatura wody (podłoga)"},
  floor_surface_temperature: {en:"Floor surface temperature", uk:"Температура поверхні підлоги", de:"Oberflächentemperatur des Fußbodens", nl:"Oppervlaktetemperatuur vloer", fr:"Température de surface du sol", es:"Temperatura superficial del suelo", pl:"Temperatura powierzchni podłogi"},
  flow: {en:"Flow", uk:"Витрата", de:"Durchfluss", nl:"Debiet", fr:"Débit", es:"Flujo", pl:"Przepływ"},
  flow_Q_m3h: {en:"Volume flow (Q)", uk:"Об'ємна витрата (Q)", de:"Volumenstrom (Q)", nl:"Volumedebiet (Q)", fr:"Débit volumique (Q)", es:"Caudal volumétrico (Q)", pl:"Strumień objętości (Q)"},
  flow_m3_s: {en:"Operating flow rate", uk:"Робоча витрата", de:"Betriebsvolumenstrom", nl:"Bedrijfsdebiet", fr:"Débit de fonctionnement", es:"Caudal de funcionamiento", pl:"Przepływ roboczy"},
  flow_mode: {en:"Flow input mode", uk:"Спосіб задання витрати", de:"Eingabemodus Durchfluss", nl:"Invoermodus debiet", fr:"Mode de saisie du débit", es:"Modo de entrada del caudal", pl:"Tryb wprowadzania przepływu"},
  flow_temperature: {en:"Flow temperature", uk:"Температура подачі", de:"Vorlauftemperatur", nl:"Aanvoertemperatuur", fr:"Température de départ", es:"Temperatura de impulsión", pl:"Temperatura zasilania"},
  flow_v_ms: {en:"Flow velocity (v)", uk:"Швидкість потоку (v)", de:"Strömungsgeschwindigkeit (v)", nl:"Stroomsnelheid (v)", fr:"Vitesse d'écoulement (v)", es:"Velocidad de flujo (v)", pl:"Prędkość przepływu (v)"},
  fluid: {en:"Fluid", uk:"Рідина", de:"Fluid", nl:"Vloeistof", fr:"Fluide", es:"Fluido", pl:"Płyn"},
  flux_before_shutdown: {en:"Flux before shutdown", uk:"Потік нейтронів до зупинки", de:"Fluss vor Abschaltung", nl:"Flux vóór uitschakeling", fr:"Flux avant l'arrêt", es:"Flujo antes de la parada", pl:"Strumień przed wyłączeniem"},
  fos_tresca: {en:"Factor of safety (Tresca)", uk:"Коефіцієнт запасу (Треска)", de:"Sicherheitsfaktor (Tresca)", nl:"Veiligheidsfactor (Tresca)", fr:"Coefficient de sécurité (Tresca)", es:"Factor de seguridad (Tresca)", pl:"Współczynnik bezpieczeństwa (Treski)"},
  fos_von_mises: {en:"Factor of safety (von Mises)", uk:"Коефіцієнт запасу (фон Мізес)", de:"Sicherheitsfaktor (von Mises)", nl:"Veiligheidsfactor (von Mises)", fr:"Coefficient de sécurité (von Mises)", es:"Factor de seguridad (von Mises)", pl:"Współczynnik bezpieczeństwa (von Misesa)"},
  fouling_cold: {en:"Cold-side fouling factor", uk:"Коефіцієнт забруднення (холодна сторона)", de:"Verschmutzungsfaktor Kaltseite", nl:"Vervuilingsfactor koude zijde", fr:"Facteur d'encrassement côté froid", es:"Factor de ensuciamiento lado frío", pl:"Współczynnik zanieczyszczenia (strona zimna)"},
  fouling_hot: {en:"Hot-side fouling factor", uk:"Коефіцієнт забруднення (гаряча сторона)", de:"Verschmutzungsfaktor Heißseite", nl:"Vervuilingsfactor warme zijde", fr:"Facteur d'encrassement côté chaud", es:"Factor de ensuciamiento lado caliente", pl:"Współczynnik zanieczyszczenia (strona gorąca)"},
  frame_time_s: {en:"Frame time", uk:"Час кадру", de:"Zeitpunkt des Einzelbilds", nl:"Tijdstip beeld", fr:"Temps de l'image", es:"Tiempo del fotograma", pl:"Czas klatki"},
  frequencies_hz: {en:"Natural frequencies", uk:"Власні частоти", de:"Eigenfrequenzen", nl:"Eigenfrequenties", fr:"Fréquences propres", es:"Frecuencias propias", pl:"Częstotliwości drgań własnych"},
  friction_factor: {en:"Friction factor", uk:"Коефіцієнт тертя", de:"Reibungsbeiwert", nl:"Wrijvingsfactor", fr:"Coefficient de frottement", es:"Factor de fricción", pl:"Współczynnik tarcia"},
  fuel_matrix: {en:"Fuel matrix", uk:"Матриця палива", de:"Brennstoffmatrix", nl:"Splijtstofmatrix", fr:"Matrice du combustible", es:"Matriz del combustible", pl:"Matryca paliwa"},
  fwhm: {en:"Full width at half maximum", uk:"Ширина на половині висоти", de:"Halbwertsbreite", nl:"Volledige breedte op halve hoogte", fr:"Largeur à mi-hauteur", es:"Anchura a media altura", pl:"Szerokość połówkowa"},
  gain_crossover_w: {en:"Gain crossover frequency (ω)", uk:"Частота зрізу за підсиленням (ω)", de:"Verstärkungsdurchtrittsfrequenz (ω)", nl:"Kantelfrequentie versterking (ω)", fr:"Pulsation de coupure en gain (ω)", es:"Frecuencia de cruce de ganancia (ω)", pl:"Częstość przecięcia wzmocnienia (ω)"},
  gain_margin_dB: {en:"Gain margin", uk:"Запас стійкості за амплітудою", de:"Amplitudenrand", nl:"Amplitudemarge", fr:"Marge de gain", es:"Margen de ganancia", pl:"Zapas wzmocnienia"},
  gamma: [{u:"-", en:"Specific heat ratio", uk:"Показник адіабати", de:"Isentropenexponent", nl:"Verhouding soortelijke warmten", fr:"Rapport des chaleurs spécifiques", es:"Relación de calores específicos", pl:"Wykładnik izentropy"}],
  gas: {en:"Gas", uk:"Газ", de:"Gas", nl:"Gas", fr:"Gaz", es:"Gas", pl:"Gaz"},
  gas_cooler_outlet_temperature: {en:"Gas cooler outlet temperature", uk:"Температура на виході газоохолоджувача", de:"Austrittstemperatur Gaskühler", nl:"Uittredetemperatuur gaskoeler", fr:"Température de sortie du refroidisseur de gaz", es:"Temperatura de salida del enfriador de gas", pl:"Temperatura wylotowa chłodnicy gazu"},
  gas_cooler_pressure: {en:"Gas cooler pressure", uk:"Тиск у газоохолоджувачі", de:"Gaskühlerdruck", nl:"Gaskoelerdruk", fr:"Pression du refroidisseur de gaz", es:"Presión del enfriador de gas", pl:"Ciśnienie w chłodnicy gazu"},
  gas_residual_rel: {en:"Gas balance residual", uk:"Нев'язка балансу газу", de:"Residuum der Gasbilanz", nl:"Residu gasbalans", fr:"Résidu du bilan gazeux", es:"Residuo del balance de gas", pl:"Residuum bilansu gazu"},
  generation_time: {en:"Neutron generation time", uk:"Час життя покоління нейтронів", de:"Neutronengenerationszeit", nl:"Neutronengeneratietijd", fr:"Temps de génération des neutrons", es:"Tiempo de generación de neutrones", pl:"Czas generacji neutronów"},
  geometric_inlet_area: {en:"Geometric inlet area", uk:"Геометрична площа припливу", de:"Geometrische Zuluftfläche", nl:"Geometrische toevoeroppervlakte", fr:"Surface géométrique d'amenée d'air", es:"Superficie geométrica de entrada de aire", pl:"Powierzchnia geometryczna dopływu powietrza"},
  geometry: {en:"Geometry", uk:"Геометрія", de:"Geometrie", nl:"Geometrie", fr:"Géométrie", es:"Geometría", pl:"Geometria"},
  geometry_mode: {en:"Geometry mode", uk:"Режим геометрії", de:"Geometriemodus", nl:"Geometriemodus", fr:"Mode de géométrie", es:"Modo de geometría", pl:"Tryb geometrii"},
  ghi: {en:"Global horizontal irradiance (GHI)", uk:"Сумарне горизонтальне опромінення (GHI)", de:"Globalstrahlung horizontal (GHI)", nl:"Globale horizontale straling (GHI)", fr:"Irradiance globale horizontale (GHI)", es:"Irradiancia global horizontal (GHI)", pl:"Napromieniowanie całkowite poziome (GHI)"},
  glazing_area: {en:"Glazing area", uk:"Площа засклення", de:"Verglasungsfläche", nl:"Glasoppervlak", fr:"Surface vitrée", es:"Superficie acristalada", pl:"Powierzchnia przeszklenia"},
  glazing_solar_load: {en:"Glazing solar load", uk:"Сонячне навантаження через засклення", de:"Solarlast über die Verglasung", nl:"Zonnelast via beglazing", fr:"Charge solaire par le vitrage", es:"Carga solar por acristalamiento", pl:"Obciążenie słoneczne przez przeszklenie"},
  gravity_g: {en:"Gravitational acceleration (g)", uk:"Прискорення вільного падіння (g)", de:"Erdbeschleunigung (g)", nl:"Valversnelling (g)", fr:"Accélération de la pesanteur (g)", es:"Aceleración de la gravedad (g)", pl:"Przyspieszenie ziemskie (g)"},
  grid: {en:"Grid size", uk:"Розмір сітки", de:"Rastergröße", nl:"Rastergrootte", fr:"Taille de la grille", es:"Tamaño de la malla", pl:"Rozmiar siatki"},
  grid_code_pass: {en:"Grid code compliant", uk:"Відповідність мережевому кодексу", de:"Netzcode erfüllt", nl:"Voldoet aan grid code", fr:"Conforme au code de réseau", es:"Cumple el código de red", pl:"Zgodność z kodeksem sieci"},
  ground_albedo: {en:"Ground albedo", uk:"Альбедо поверхні землі", de:"Bodenalbedo", nl:"Bodemalbedo", fr:"Albédo du sol", es:"Albedo del suelo", pl:"Albedo gruntu"},
  ground_reflected_component: {en:"Ground-reflected irradiance component", uk:"Складова, відбита від землі", de:"Bodenreflektierter Anteil", nl:"Grondreflectiecomponent", fr:"Composante réfléchie par le sol", es:"Componente reflejada por el suelo", pl:"Składowa odbita od gruntu"},
  h: [{u:["kJ/kg","J/kg"], en:"Specific enthalpy", uk:"Питома ентальпія", de:"Spezifische Enthalpie", nl:"Specifieke enthalpie", fr:"Enthalpie massique", es:"Entalpía específica", pl:"Entalpia właściwa"}, {u:["W/(m2.K)","W/m2K"], en:"Surface heat transfer coefficient", uk:"Коефіцієнт тепловіддачі", de:"Wärmeübergangskoeffizient", nl:"Warmteovergangscoëfficiënt", fr:"Coefficient de transfert surfacique", es:"Coeficiente de transferencia superficial", pl:"Współczynnik przejmowania ciepła"}, {u:["m","mm"], en:"Height", uk:"Висота", de:"Höhe", nl:"Hoogte", fr:"Hauteur", es:"Altura", pl:"Wysokość"}],
  h_surface: {en:"Surface heat transfer coefficient", uk:"Коефіцієнт тепловіддачі поверхні", de:"Wärmeübergangskoeffizient Oberfläche", nl:"Warmteoverdrachtscoëfficiënt oppervlak", fr:"Coefficient d'échange superficiel", es:"Coeficiente de convección superficial", pl:"Współczynnik przejmowania ciepła powierzchni"},
  half_life_s: {en:"Half-life", uk:"Період напіврозпаду", de:"Halbwertszeit", nl:"Halveringstijd", fr:"Période radioactive (demi-vie)", es:"Periodo de semidesintegración", pl:"Czas połowicznego rozpadu"},
  hatch_aerodynamic_area: {en:"Hatch aerodynamic area", uk:"Аеродинамічна площа люка", de:"Aerodynamische Fläche der Klappe", nl:"Aerodynamische oppervlakte rookluik", fr:"Surface aérodynamique de l'exutoire", es:"Superficie aerodinámica del exutorio", pl:"Powierzchnia aerodynamiczna klapy"},
  hatch_count: {en:"Number of hatches", uk:"Кількість люків", de:"Anzahl Klappen", nl:"Aantal rookluiken", fr:"Nombre d'exutoires", es:"Número de exutorios", pl:"Liczba klap"},
  hatch_count_all_reservoirs: {en:"Hatches, all reservoirs", uk:"Люки, усі резервуари", de:"Klappen, alle Rauchabschnitte", nl:"Rookluiken, alle reservoirs", fr:"Exutoires, tous réservoirs", es:"Exutorios, todos los depósitos", pl:"Klapy, wszystkie zbiorniki"},
  hatch_geometric_area: {en:"Hatch geometric area", uk:"Геометрична площа люка", de:"Geometrische Fläche der Klappe", nl:"Geometrische oppervlakte rookluik", fr:"Surface géométrique de l'exutoire", es:"Superficie geométrica del exutorio", pl:"Powierzchnia geometryczna klapy"},
  head_loss: {en:"Head loss", uk:"Втрати напору", de:"Förderhöhenverlust", nl:"Drukhoogteverlies", fr:"Perte de charge", es:"Pérdida de carga", pl:"Strata wysokości podnoszenia"},
  head_m: {en:"Operating head", uk:"Робочий напір", de:"Betriebsförderhöhe", nl:"Bedrijfsopvoerhoogte", fr:"Hauteur manométrique de fonctionnement", es:"Altura de funcionamiento", pl:"Wysokość podnoszenia robocza"},
  head_major: {en:"Major head loss", uk:"Втрати напору на тертя", de:"Linienverlust (Reibung)", nl:"Wrijvingsverlies (major)", fr:"Perte de charge linéaire", es:"Pérdida de carga por fricción", pl:"Strata liniowa (tarcie)"},
  head_minor: {en:"Minor head loss", uk:"Місцеві втрати напору", de:"Einzelverlust", nl:"Lokaal verlies (minor)", fr:"Perte de charge singulière", es:"Pérdida de carga localizada", pl:"Strata miejscowa"},
  head_total: {en:"Total head", uk:"Повний напір", de:"Gesamtförderhöhe", nl:"Totale opvoerhoogte", fr:"Hauteur manométrique totale", es:"Altura manométrica total", pl:"Wysokość podnoszenia całkowita"},
  heatLoss: {en:"Heat loss", uk:"Тепловтрати", de:"Wärmeverlust", nl:"Warmteverlies", fr:"Déperdition thermique", es:"Pérdida de calor", pl:"Strata ciepła"},
  heat_added: {en:"Heat added", uk:"Підведене тепло", de:"Zugeführte Wärme", nl:"Toegevoerde warmte", fr:"Chaleur ajoutée", es:"Calor añadido", pl:"Dodane ciepło"},
  heat_flux: {en:"Heat flux", uk:"Тепловий потік", de:"Wärmestromdichte", nl:"Warmteflux", fr:"Flux thermique", es:"Flujo de calor", pl:"Strumień ciepła"},
  heat_input: {en:"Heat input", uk:"Підведене тепло", de:"Zugeführte Wärme", nl:"Toegevoerde warmte", fr:"Chaleur fournie", es:"Calor aportado", pl:"Ciepło doprowadzone"},
  heat_load: {en:"Heat load", uk:"Теплове навантаження", de:"Heizlast", nl:"Warmtelast", fr:"Charge thermique", es:"Carga térmica", pl:"Obciążenie cieplne"},
  heat_load_total: {en:"Total heat load", uk:"Сумарне теплове навантаження", de:"Gesamtheizlast", nl:"Totale warmtelast", fr:"Charge thermique totale", es:"Carga térmica total", pl:"Całkowite obciążenie cieplne"},
  heat_loss_coefficient: {en:"Heat loss coefficient", uk:"Коефіцієнт тепловтрат", de:"Wärmeverlustkoeffizient", nl:"Warmteverliescoëfficiënt", fr:"Coefficient de déperdition thermique", es:"Coeficiente de pérdidas térmicas", pl:"Współczynnik strat ciepła"},
  heat_rejected: {en:"Heat rejected", uk:"Відведене тепло", de:"Abgeführte Wärme", nl:"Afgevoerde warmte", fr:"Chaleur rejetée", es:"Calor rechazado", pl:"Ciepło odprowadzone"},
  heat_release_density: {en:"Heat release rate density", uk:"Питома швидкість тепловиділення", de:"Spezifische Wärmefreisetzungsrate", nl:"Specifiek warmteafgiftevermogen", fr:"Densité de puissance calorifique", es:"Densidad de potencia calorífica", pl:"Gęstość mocy pożaru"},
  heat_source: {en:"Heat source power", uk:"Потужність джерела тепла", de:"Leistung der Wärmequelle", nl:"Vermogen warmtebron", fr:"Puissance de la source de chaleur", es:"Potencia de la fuente de calor", pl:"Moc źródła ciepła"},
  heat_total: {en:"Heat load", uk:"Теплове навантаження", de:"Heizlast", nl:"Warmtelast", fr:"Charge thermique", es:"Carga térmica", pl:"Obciążenie cieplne"},
  heating_coil_duty: {en:"Heating coil duty", uk:"Теплове навантаження нагрівача", de:"Heizleistung des Heizregisters", nl:"Verwarmingsvermogen batterij", fr:"Puissance de la batterie chaude", es:"Potencia de la batería de calor", pl:"Moc nagrzewnicy"},
  heating_duty: {en:"Heating duty", uk:"Теплопродуктивність", de:"Heizleistung", nl:"Verwarmingsvermogen", fr:"Puissance de chauffe", es:"Potencia calorífica", pl:"Moc grzewcza"},
  heavy_metal_at_shutdown: {en:"Heavy-metal mass at shutdown", uk:"Маса важких металів на момент зупинки", de:"Schwermetallmasse bei Abschaltung", nl:"Massa zware metalen bij uitschakeling", fr:"Masse de métaux lourds à l'arrêt", es:"Masa de metales pesados en la parada", pl:"Masa metali ciężkich przy wyłączeniu"},
  heavy_metal_mass: {en:"Heavy-metal mass", uk:"Маса важких металів", de:"Schwermetallmasse", nl:"Massa zware metalen", fr:"Masse de métaux lourds", es:"Masa de metales pesados", pl:"Masa metali ciężkich"},
  height: {en:"Height", uk:"Висота", de:"Höhe", nl:"Hoogte", fr:"Hauteur", es:"Altura", pl:"Wysokość"},
  histories_requested: {en:"Histories requested", uk:"Запитано історій", de:"Angeforderte Historien", nl:"Gevraagde historie's", fr:"Historiques demandés", es:"Historias solicitadas", pl:"Żądana liczba historii"},
  histories_run: {en:"Histories run", uk:"Виконано історій", de:"Ausgeführte Historien", nl:"Uitgevoerde historie's", fr:"Historiques exécutés", es:"Historias ejecutadas", pl:"Wykonane historie"},
  hot_fluid: {en:"Hot fluid", uk:"Гарячий теплоносій", de:"Warmes Fluid", nl:"Warm medium", fr:"Fluide chaud", es:"Fluido caliente", pl:"Czynnik gorący"},
  hour: {en:"Hour", uk:"Година", de:"Stunde", nl:"Uur", fr:"Heure", es:"Hora", pl:"Godzina"},
  hour_angle: {en:"Hour angle", uk:"Годинний кут", de:"Stundenwinkel", nl:"Uurhoek", fr:"Angle horaire", es:"Ángulo horario", pl:"Kąt godzinny"},
  humidity_class: {en:"Humidity class", uk:"Клас вологості", de:"Feuchteklasse", nl:"Vochtklasse", fr:"Classe d'humidité", es:"Clase de humedad", pl:"Klasa wilgotności"},
  impurity_level_ppm: {en:"Nitrogen impurity in fuel", uk:"Домішка азоту в паливі", de:"Stickstoffverunreinigung im Brennstoff", nl:"Stikstofverontreiniging in de splijtstof", fr:"Impureté d'azote dans le combustible", es:"Impureza de nitrógeno en el combustible", pl:"Zanieczyszczenie azotem w paliwie"},
  incident_power: {en:"Incident power", uk:"Потужність падаючого випромінювання", de:"Einfallende Strahlungsleistung", nl:"Invallend vermogen", fr:"Puissance incidente", es:"Potencia incidente", pl:"Moc padającego promieniowania"},
  indoor_mean_temperature: {en:"Indoor mean temperature", uk:"Середня температура приміщення", de:"Mittlere Raumtemperatur", nl:"Gemiddelde binnentemperatuur", fr:"Température intérieure moyenne", es:"Temperatura interior media", pl:"Średnia temperatura wewnętrzna"},
  indoor_summer_t: {en:"Indoor summer temperature", uk:"Внутрішня температура (літо)", de:"Innentemperatur Sommer", nl:"Binnentemperatuur zomer", fr:"Température intérieure d'été", es:"Temperatura interior de verano", pl:"Temperatura wewnętrzna latem"},
  indoor_winter_t: {en:"Indoor winter temperature", uk:"Внутрішня температура (зима)", de:"Innentemperatur Winter", nl:"Binnentemperatuur winter", fr:"Température intérieure d'hiver", es:"Temperatura interior de invierno", pl:"Temperatura wewnętrzna zimą"},
  inflow_volume: {en:"Inflow volume rate", uk:"Об'ємна витрата припливу", de:"Zuluftvolumenstrom", nl:"Volumedebiet instroom", fr:"Débit volumique entrant", es:"Caudal volumétrico entrante", pl:"Strumień objętości dopływu"},
  initial_pressure: {en:"Initial pressure", uk:"Початковий тиск", de:"Anfangsdruck", nl:"Beginddruk", fr:"Pression initiale", es:"Presión inicial", pl:"Ciśnienie początkowe"},
  initial_temperature: {en:"Initial temperature", uk:"Початкова температура", de:"Anfangstemperatur", nl:"Begintemperatuur", fr:"Température initiale", es:"Temperatura inicial", pl:"Temperatura początkowa"},
  inlet_temperature: {en:"Inlet temperature", uk:"Температура на вході", de:"Eintrittstemperatur", nl:"Intredetemperatuur", fr:"Température d'entrée", es:"Temperatura de entrada", pl:"Temperatura na wlocie"},
  integration_step: {en:"Integration step", uk:"Крок інтегрування", de:"Integrationsschritt", nl:"Integratiestap", fr:"Pas d'intégration", es:"Paso de integración", pl:"Krok całkowania"},
  intermediate_pressure: {en:"Intermediate pressure", uk:"Проміжний тиск", de:"Zwischendruck", nl:"Tussendruk", fr:"Pression intermédiaire", es:"Presión intermedia", pl:"Ciśnienie pośrednie"},
  internal_hx_effectiveness: {en:"Internal HX effectiveness", uk:"Ефективність внутрішнього теплообмінника", de:"Wirkungsgrad des internen Wärmeübertragers", nl:"Rendement interne warmtewisselaar", fr:"Efficacité de l'échangeur interne", es:"Eficacia del intercambiador interno", pl:"Skuteczność wewn. wymiennika ciepła"},
  internal_load: {en:"Internal load", uk:"Внутрішнє навантаження", de:"Innere Last", nl:"Interne belasting", fr:"Charge interne", es:"Carga interna", pl:"Obciążenie wewnętrzne"},
  inverse_gamma: {en:"Inverse Lorentz factor (1/γ)", uk:"Обернений фактор Лоренца (1/γ)", de:"Reziproker Lorentzfaktor (1/γ)", nl:"Omgekeerde lorentzfactor (1/γ)", fr:"Inverse du facteur de Lorentz (1/γ)", es:"Inverso del factor de Lorentz (1/γ)", pl:"Odwrotność czynnika Lorentza (1/γ)"},
  irradiation_time: {en:"Irradiation time", uk:"Час опромінення", de:"Bestrahlungszeit", nl:"Bestralingstijd", fr:"Durée d'irradiation", es:"Tiempo de irradiación", pl:"Czas napromieniania"},
  joukowsky_pressure_rise: {en:"Joukowsky pressure surge", uk:"Стрибок тиску Жуковського", de:"Joukowsky-Druckstoß", nl:"Joukowsky-drukstoot", fr:"Surpression de Joukowsky", es:"Sobrepresión de Joukowsky", pl:"Uderzenie hydrauliczne Żukowskiego"},
  kT: {en:"Thermal energy (kT)", uk:"Теплова енергія (kT)", de:"Thermische Energie (kT)", nl:"Thermische energie (kT)", fr:"Énergie thermique (kT)", es:"Energía térmica (kT)", pl:"Energia termiczna (kT)"},
  k_eff: {en:"Effective multiplication factor (k_eff)", uk:"Ефективний коефіцієнт розмноження (k_eff)", de:"Effektiver Multiplikationsfaktor (k_eff)", nl:"Effectieve multiplicatiefactor (k_eff)", fr:"Facteur de multiplication effectif (k_eff)", es:"Factor de multiplicación efectivo (k_eff)", pl:"Efektywny współczynnik mnożenia (k_eff)"},
  kappa: {en:"Peak factor (κ)", uk:"Ударний коефіцієнт (κ)", de:"Stoßfaktor (κ)", nl:"Piekfactor (κ)", fr:"Facteur de crête (κ)", es:"Factor de cresta (κ)", pl:"Współczynnik udaru (κ)"},
  kappa_internal: {en:"Internal areal heat capacity (κ)", uk:"Питома теплоємність внутрішньої частини (κ)", de:"Innere flächenbezogene Wärmespeicherkapazität (κ)", nl:"Inwendige oppervlaktewarmtecapaciteit (κ)", fr:"Capacité thermique surfacique intérieure (κ)", es:"Capacidad térmica superficial interior (κ)", pl:"Wewnętrzna pojemność cieplna powierzchniowa (κ)"},
  kinematic_viscosity: {en:"Kinematic viscosity", uk:"Кінематична в'язкість", de:"Kinematische Viskosität", nl:"Kinematische viscositeit", fr:"Viscosité cinématique", es:"Viscosidad cinemática", pl:"Lepkość kinematyczna"},
  known_heat_load: {en:"Known heat load", uk:"Відоме теплове навантаження", de:"Bekannte Heizlast", nl:"Bekende warmtelast", fr:"Charge thermique connue", es:"Carga térmica conocida", pl:"Znane obciążenie cieplne"},
  latitude: {en:"Latitude", uk:"Широта", de:"Breitengrad", nl:"Breedtegraad", fr:"Latitude", es:"Latitud", pl:"Szerokość geograficzna"},
  layer_depth: {en:"Smoke layer depth", uk:"Товщина шару диму", de:"Rauchschichtdicke", nl:"Rooklaagdikte", fr:"Épaisseur de la couche de fumée", es:"Espesor de la capa de humos", pl:"Grubość warstwy dymu"},
  leading_heat_contributors: {en:"Leading heat contributors", uk:"Основні джерела тепла", de:"Wichtigste Wärmebeiträge", nl:"Grootste warmtebijdragen", fr:"Principaux contributeurs à la chaleur", es:"Principales contribuyentes al calor", pl:"Główne składniki ciepła"},
  leak_discharge_coefficient: {en:"Leak discharge coefficient", uk:"Коефіцієнт витрати витоку", de:"Durchflusskoeffizient Leckage", nl:"Afvoercoëfficiënt lek", fr:"Coefficient de décharge de fuite", es:"Coeficiente de descarga de fuga", pl:"Współczynnik wypływu nieszczelności"},
  leak_flow: {en:"Leak flow", uk:"Витрата витоку", de:"Leckvolumenstrom", nl:"Lekdebiet", fr:"Débit de fuite", es:"Caudal de fuga", pl:"Przepływ nieszczelności"},
  leakage_per_source_neutron: {en:"Leakage per source neutron", uk:"Витік на нейтрон джерела", de:"Leckage je Quellneutron", nl:"Lekkage per bronneutron", fr:"Fuite par neutron source", es:"Fuga por neutrón fuente", pl:"Wyciek na neutron źródłowy"},
  length: {en:"Length", uk:"Довжина", de:"Länge", nl:"Lengte", fr:"Longueur", es:"Longitud", pl:"Długość"},
  length_L: {en:"Pipe length (L)", uk:"Довжина труби (L)", de:"Rohrlänge (L)", nl:"Leidinglengte (L)", fr:"Longueur de conduite (L)", es:"Longitud de tubería (L)", pl:"Długość rurociągu (L)"},
  length_contraction: {en:"Length contraction", uk:"Скорочення довжини", de:"Längenkontraktion", nl:"Lengtecontractie", fr:"Contraction des longueurs", es:"Contracción de longitud", pl:"Skrócenie długości"},
  length_ratio: {en:"Length-to-diameter ratio (L/D)", uk:"Відношення довжини до діаметра (L/D)", de:"Verhältnis Länge zu Durchmesser (L/D)", nl:"Verhouding lengte/diameter (L/D)", fr:"Rapport longueur/diamètre (L/D)", es:"Relación longitud/diámetro (L/D)", pl:"Stosunek długości do średnicy (L/D)"},
  lifetime_cost: {en:"Lifetime cost", uk:"Витрати за строк служби", de:"Lebenszykluskosten", nl:"Totale kosten over de levensduur", fr:"Coût sur la durée de vie", es:"Coste durante la vida útil", pl:"Koszt w cyklu życia"},
  light_clock_coordinate_time: {en:"Light-clock coordinate time", uk:"Координатний час світлового годинника", de:"Koordinatenzeit der Lichtuhr", nl:"Coördinatentijd lichtklok", fr:"Temps-coordonnée de l'horloge lumineuse", es:"Tiempo de coordenada del reloj de luz", pl:"Czas współrzędnościowy zegara świetlnego"},
  lighting_load: {en:"Lighting load", uk:"Навантаження від освітлення", de:"Beleuchtungslast", nl:"Verlichtingslast", fr:"Charge d'éclairage", es:"Carga de iluminación", pl:"Obciążenie od oświetlenia"},
  limit_cycle_amplitude: {en:"Limit-cycle amplitude", uk:"Амплітуда граничного циклу", de:"Amplitude des Grenzzyklus", nl:"Amplitude grenscyclus", fr:"Amplitude du cycle limite", es:"Amplitud del ciclo límite", pl:"Amplituda cyklu granicznego"},
  limit_cycle_period: {en:"Limit-cycle period", uk:"Період граничного циклу", de:"Periode des Grenzzyklus", nl:"Periode grenscyclus", fr:"Période du cycle limite", es:"Período del ciclo límite", pl:"Okres cyklu granicznego"},
  linke_turbidity: {en:"Linke turbidity factor", uk:"Фактор каламутності Лінке", de:"Linke-Trübungsfaktor", nl:"Linke-troebelingsfactor", fr:"Facteur de trouble de Linke", es:"Factor de turbiedad de Linke", pl:"Współczynnik mętności Linkego"},
  live_steam_temperature: {en:"Live steam temperature", uk:"Температура гострої пари", de:"Frischdampftemperatur", nl:"Verse-stoomtemperatuur", fr:"Température de vapeur vive", es:"Temperatura de vapor vivo", pl:"Temperatura pary świeżej"},
  load: {en:"Load", uk:"Навантаження", de:"Last", nl:"Belasting", fr:"Charge", es:"Carga", pl:"Obciążenie"},
  load_factor: {en:"Load factor", uk:"Коефіцієнт навантаження", de:"Lastfaktor", nl:"Belastingsfactor", fr:"Facteur de charge", es:"Factor de carga", pl:"Współczynnik obciążenia"},
  load_method: {en:"Load calculation method", uk:"Метод розрахунку навантаження", de:"Berechnungsmethode der Last", nl:"Berekeningsmethode belasting", fr:"Méthode de calcul de la charge", es:"Método de cálculo de la carga", pl:"Metoda obliczania obciążenia"},
  longitude: {en:"Longitude", uk:"Довгота", de:"Längengrad", nl:"Lengtegraad", fr:"Longitude", es:"Longitud (geográfica)", pl:"Długość geograficzna"},
  loop_convergence_order: {en:"Loop convergence order", uk:"Порядок збіжності контуру", de:"Konvergenzordnung des Kreises", nl:"Convergentieorde van de kring", fr:"Ordre de convergence de la boucle", es:"Orden de convergencia del lazo", pl:"Rząd zbieżności pętli"},
  m_cold: {en:"Cold-side mass flow rate", uk:"Масова витрата холодного теплоносія", de:"Massenstrom Kaltseite", nl:"Massadebiet koude zijde", fr:"Débit massique côté froid", es:"Caudal másico lado frío", pl:"Strumień masy, strona zimna"},
  m_final: {en:"Final vessel mass", uk:"Кінцева маса в посудині", de:"Endmasse im Behälter", nl:"Eindmassa in het vat", fr:"Masse finale dans la cuve", es:"Masa final en el recipiente", pl:"Końcowa masa w zbiorniku"},
  m_hot: {en:"Hot-side mass flow rate", uk:"Масова витрата гарячого теплоносія", de:"Massenstrom Heißseite", nl:"Massadebiet warme zijde", fr:"Débit massique côté chaud", es:"Caudal másico lado caliente", pl:"Strumień masy, strona gorąca"},
  m_released: {en:"Mass released", uk:"Викинута маса", de:"Freigesetzte Masse", nl:"Vrijgekomen massa", fr:"Masse relâchée", es:"Masa liberada", pl:"Uwolniona masa"},
  mach_angle: {en:"Mach angle (μ)", uk:"Кут Маха (μ)", de:"Machwinkel (μ)", nl:"Machhoek (μ)", fr:"Angle de Mach (μ)", es:"Ángulo de Mach (μ)", pl:"Kąt Macha (μ)"},
  machine_load: {en:"Machine load", uk:"Навантаження від обладнання", de:"Maschinenlast", nl:"Machinelast", fr:"Charge des machines", es:"Carga de máquinas", pl:"Obciążenie od maszyn"},
  maintenance_hours_adiabatic: {en:"Maintenance hours, adiabatic", uk:"Години обслуговування, адіабатичне охолодження", de:"Wartungsstunden, adiabate Kühlung", nl:"Onderhoudsuren, adiabatische koeling", fr:"Heures de maintenance, refroidissement adiabatique", es:"Horas de mantenimiento, enfriamiento adiabático", pl:"Godziny konserwacji, chłodzenie adiabatyczne"},
  maintenance_hours_mechanical: {en:"Maintenance hours, mechanical", uk:"Години обслуговування, механічне охолодження", de:"Wartungsstunden, mechanische Kühlung", nl:"Onderhoudsuren, mechanische koeling", fr:"Heures de maintenance, refroidissement mécanique", es:"Horas de mantenimiento, enfriamiento mecánico", pl:"Godziny konserwacji, chłodzenie mechaniczne"},
  maintenance_hours_ventilation: {en:"Maintenance hours, ventilation", uk:"Години обслуговування, вентиляція", de:"Wartungsstunden, Lüftung", nl:"Onderhoudsuren, ventilatie", fr:"Heures de maintenance, ventilation", es:"Horas de mantenimiento, ventilación", pl:"Godziny konserwacji, wentylacja"},
  maintenance_rate: {en:"Maintenance labour rate", uk:"Вартість обслуговування за годину", de:"Wartungsstundensatz", nl:"Onderhoudstarief", fr:"Taux horaire de maintenance", es:"Tarifa de mantenimiento", pl:"Stawka za konserwację"},
  make_up_air_volume_flow: {en:"Make-up air volume flow", uk:"Об'ємна витрата компенсаційного повітря", de:"Volumenstrom der Zuluft (Ersatzluft)", nl:"Volumedebiet toevoerlucht", fr:"Débit volumique d'air de compensation", es:"Caudal volumétrico de aire de reposición", pl:"Strumień objętości powietrza kompensacyjnego"},
  manufacturer: {en:"Manufacturer", uk:"Виробник", de:"Hersteller", nl:"Fabrikant", fr:"Fabricant", es:"Fabricante", pl:"Producent"},
  mass: {en:"Mass", uk:"Маса", de:"Masse", nl:"Massa", fr:"Masse", es:"Masa", pl:"Masa"},
  mass_flow: {en:"Mass flow rate", uk:"Масова витрата", de:"Massenstrom", nl:"Massadebiet", fr:"Débit massique", es:"Caudal másico", pl:"Strumień masy"},
  mass_flow_in: {en:"Mass flow, inlet", uk:"Масова витрата, приплив", de:"Massenstrom, Zuluft", nl:"Massadebiet, toevoer", fr:"Débit massique, entrant", es:"Caudal másico, entrada", pl:"Strumień masy, dopływ"},
  mass_flow_out: {en:"Mass flow, outlet", uk:"Масова витрата, витяжка", de:"Massenstrom, Abluft", nl:"Massadebiet, afvoer", fr:"Débit massique, sortant", es:"Caudal másico, salida", pl:"Strumień masy, wypływ"},
  mass_flow_supply: {en:"Mass flow, mechanical supply", uk:"Масова витрата, механічна подача", de:"Massenstrom, mechanische Zuluft", nl:"Massadebiet, mechanische toevoer", fr:"Débit massique, soufflage mécanique", es:"Caudal másico, impulsión mecánica", pl:"Strumień masy, nawiew mechaniczny"},
  mass_flux_ideal: {en:"Ideal mass flux", uk:"Ідеальний масовий потік", de:"Ideale Massenstromdichte", nl:"Ideale massaflux", fr:"Flux massique idéal", es:"Flujo másico ideal", pl:"Idealny strumień masy"},
  materials: {en:"Materials", uk:"Матеріали", de:"Materialien", nl:"Materialen", fr:"Matériaux", es:"Materiales", pl:"Materiały"},
  maxTime: {en:"Maximum simulation time", uk:"Максимальний час моделювання", de:"Maximale Simulationszeit", nl:"Maximale simulatietijd", fr:"Durée maximale de simulation", es:"Tiempo máximo de simulación", pl:"Maksymalny czas symulacji"},
  max_dln_u_dlnE: {en:"Max slope, d ln u/d ln E", uk:"Макс. нахил d ln u/d ln E", de:"Max. Steigung d ln u/d ln E", nl:"Max. helling d ln u/d ln E", fr:"Pente max., d ln u/d ln E", es:"Pendiente máx., d ln u/d ln E", pl:"Maks. nachylenie d ln u/d ln E"},
  max_hem_switch_mass_flux_jump: {en:"Max. mass-flux jump at HEM switch", uk:"Макс. стрибок густини потоку при переході HEM", de:"Max. Massenstromdichtesprung beim HEM-Wechsel", nl:"Max. massafluxsprong bij HEM-overgang", fr:"Saut max. du flux massique au changement HEM", es:"Salto máx. de flujo másico en el cambio HEM", pl:"Maks. skok strumienia masy przy przejściu HEM"},
  max_opening_velocity: {en:"Maximum opening velocity", uk:"Максимальна швидкість в отворі", de:"Maximale Öffnungsgeschwindigkeit", nl:"Maximale snelheid in opening", fr:"Vitesse maximale à l'ouverture", es:"Velocidad máxima en la abertura", pl:"Maksymalna prędkość w otworze"},
  max_relative_humidity: {en:"Maximum relative humidity", uk:"Максимальна відносна вологість", de:"Maximale relative Luftfeuchte", nl:"Maximale relatieve vochtigheid", fr:"Humidité relative maximale", es:"Humedad relativa máxima", pl:"Maksymalna wilgotność względna"},
  max_rotation_rad: {en:"Maximum rotation", uk:"Максимальний кут повороту", de:"Maximale Verdrehung", nl:"Maximale rotatie", fr:"Rotation maximale", es:"Rotación máxima", pl:"Maksymalny obrót"},
  max_translation_m: {en:"Maximum displacement", uk:"Максимальне переміщення", de:"Maximale Verschiebung", nl:"Maximale verplaatsing", fr:"Déplacement maximal", es:"Desplazamiento máximo", pl:"Maksymalne przemieszczenie"},
  max_ventilator_length: {en:"Maximum vent length", uk:"Максимальна довжина вентилятора", de:"Maximale Länge je Rauchabzug", nl:"Maximale lengte per rookluik", fr:"Longueur maximale par exutoire", es:"Longitud máxima por exutorio", pl:"Maksymalna długość klapy"},
  maximum_opening_velocity: {en:"Maximum opening velocity", uk:"Максимальна швидкість в отворі", de:"Maximale Öffnungsgeschwindigkeit", nl:"Maximale snelheid in opening", fr:"Vitesse maximale à l'ouverture", es:"Velocidad máxima en la abertura", pl:"Maksymalna prędkość w otworze"},
  maximum_pressure: {en:"Maximum pressure", uk:"Максимальний тиск", de:"Maximaldruck", nl:"Maximale druk", fr:"Pression maximale", es:"Presión máxima", pl:"Ciśnienie maksymalne"},
  mda: {en:"Dry-air mass flow (mda)", uk:"Масова витрата сухого повітря (mda)", de:"Trockenluft-Massenstrom (mda)", nl:"Massadebiet droge lucht (mda)", fr:"Débit massique d'air sec (mda)", es:"Caudal másico de aire seco (mda)", pl:"Strumień masy powietrza suchego (mda)"},
  mdot: {en:"Mass flow rate", uk:"Масова витрата", de:"Massenstrom", nl:"Massadebiet", fr:"Débit massique", es:"Caudal másico", pl:"Strumień masy"},
  mdot_peak: {en:"Peak mass flow rate", uk:"Пікова масова витрата", de:"Maximaler Massenstrom", nl:"Piekmassadebiet", fr:"Débit massique de pointe", es:"Caudal másico pico", pl:"Szczytowy strumień masy"},
  mean_absorption: {en:"Mean absorption coefficient", uk:"Середній коефіцієнт поглинання", de:"Mittlerer Absorptionsgrad", nl:"Gemiddelde absorptiecoëfficiënt", fr:"Coefficient d'absorption moyen", es:"Coeficiente de absorción medio", pl:"Średni współczynnik pochłaniania"},
  mean_free_path_m: {en:"Mean free path", uk:"Середня довжина вільного пробігу", de:"Mittlere freie Weglänge", nl:"Gemiddelde vrije weglengte", fr:"Libre parcours moyen", es:"Recorrido libre medio", pl:"Średnia droga swobodna"},
  mean_relative_error: {en:"Mean relative error", uk:"Середня відносна похибка", de:"Mittlerer relativer Fehler", nl:"Gemiddelde relatieve fout", fr:"Erreur relative moyenne", es:"Error relativo medio", pl:"Średni błąd względny"},
  mean_stress: {en:"Mean (hydrostatic) stress", uk:"Середнє (гідростатичне) напруження", de:"Mittlere (hydrostatische) Spannung", nl:"Gemiddelde (hydrostatische) spanning", fr:"Contrainte moyenne (hydrostatique)", es:"Tensión media (hidrostática)", pl:"Naprężenie średnie (hydrostatyczne)"},
  mesh_quality: {en:"Mesh quality", uk:"Якість сітки", de:"Netzqualität", nl:"Meshkwaliteit", fr:"Qualité du maillage", es:"Calidad de la malla", pl:"Jakość siatki"},
  metastable_nozzle_used: {en:"Metastable nozzle model used", uk:"Використано метастабільну модель сопла", de:"Metastabiles Düsenmodell verwendet", nl:"Metastabiel dysemodel gebruikt", fr:"Modèle de tuyère métastable utilisé", es:"Modelo de tobera metaestable usado", pl:"Zastosowano metastabilny model dyszy"},
  min_outlet_equilibrium_quality: {en:"Min. outlet equilibrium quality", uk:"Мін. рівноважна сухість на виході", de:"Min. Gleichgewichtsdampfgehalt Austritt", nl:"Min. evenwichtsdampkwaliteit uitlaat", fr:"Titre d'équilibre min. en sortie", es:"Título de equilibrio mín. en salida", pl:"Min. równowag. stopień suchości wylot"},
  min_ventilator_spacing: {en:"Minimum vent spacing", uk:"Мінімальна відстань між вентиляторами", de:"Mindestabstand zwischen Rauchabzügen", nl:"Minimale afstand tussen rookluiken", fr:"Espacement minimal entre exutoires", es:"Separación mínima entre exutorios", pl:"Minimalny odstęp między klapami"},
  minimum_vessel_vapour_quality: {en:"Minimum vessel vapour quality", uk:"Мінімальна сухість пари в посудині", de:"Minimaler Dampfgehalt im Behälter", nl:"Minimale dampkwaliteit in het vat", fr:"Titre vapeur minimal dans la cuve", es:"Título de vapor mínimo en el recipiente", pl:"Minimalny stopień suchości pary w zbiorniku"},
  mixing_flow: {en:"Mixing flow", uk:"Витрата змішування", de:"Mischvolumenstrom", nl:"Mengdebiet", fr:"Débit de mélange", es:"Caudal de mezcla", pl:"Przepływ mieszania"},
  mode: {en:"Mode", uk:"Режим", de:"Modus", nl:"Modus", fr:"Mode", es:"Modo", pl:"Tryb"},
  model: {en:"Model", uk:"Модель", de:"Modell", nl:"Model", fr:"Modèle", es:"Modelo", pl:"Model"},
  model_time_s: {en:"Simulated time", uk:"Змодельований час", de:"Simulierte Zeit", nl:"Gesimuleerde tijd", fr:"Temps simulé", es:"Tiempo simulado", pl:"Czas symulacji"},
  module: {en:"Calculation module", uk:"Розрахунковий модуль", de:"Berechnungsmodul", nl:"Rekenmodule", fr:"Module de calcul", es:"Módulo de cálculo", pl:"Moduł obliczeniowy"},
  moisture_rate: {en:"Moisture generation rate", uk:"Швидкість вологовиділення", de:"Feuchtelastrate", nl:"Vochtproductiesnelheid", fr:"Taux de production d'humidité", es:"Tasa de generación de humedad", pl:"Szybkość wydzielania wilgoci"},
  month: {en:"Month", uk:"Місяць", de:"Monat", nl:"Maand", fr:"Mois", es:"Mes", pl:"Miesiąc"},
  mu: [{u:"Pa.s", en:"Dynamic viscosity", uk:"Динамічна в'язкість", de:"Dynamische Viskosität", nl:"Dynamische viscositeit", fr:"Viscosité dynamique", es:"Viscosidad dinámica", pl:"Lepkość dynamiczna"}],
  natural_abundance: {en:"Natural abundance", uk:"Природна поширеність", de:"Natürliche Häufigkeit", nl:"Natuurlijke abundantie", fr:"Abondance naturelle", es:"Abundancia natural", pl:"Naturalna zawartość izotopowa"},
  natural_ventilation_loss: {en:"Natural ventilation loss", uk:"Втрати на природну вентиляцію", de:"Lüftungswärmeverlust (natürlich)", nl:"Ventilatieverlies (natuurlijk)", fr:"Déperdition par ventilation naturelle", es:"Pérdida por ventilación natural", pl:"Straty na wentylację naturalną"},
  net_heat: {en:"Net heat gain", uk:"Чисте теплонадходження", de:"Netto-Wärmegewinn", nl:"Netto warmtewinst", fr:"Gain de chaleur net", es:"Ganancia de calor neta", pl:"Zysk ciepła netto"},
  net_power: {en:"Net power", uk:"Чиста потужність", de:"Nettoleistung", nl:"Netto vermogen", fr:"Puissance nette", es:"Potencia neta", pl:"Moc netto"},
  network_frequency_nadir_hz: {en:"Frequency nadir", uk:"Мінімум частоти мережі", de:"Frequenz-Tiefpunkt", nl:"Frequentiedieptepunt", fr:"Fréquence minimale (nadir)", es:"Frecuencia mínima (nadir)", pl:"Minimum częstotliwości sieci"},
  neutral_pressure_level: {en:"Neutral pressure level", uk:"Рівень нейтрального тиску", de:"Neutrale Druckzone", nl:"Neutraal drukvlak", fr:"Plan de pression neutre", es:"Plano de presión neutra", pl:"Poziom ciśnienia neutralnego"},
  neutron_source: {en:"Neutron source", uk:"Джерело нейтронів", de:"Neutronenquelle", nl:"Neutronenbron", fr:"Source de neutrons", es:"Fuente de neutrones", pl:"Źródło neutronów"},
  neutron_source_alpha_n: {en:"Neutron source, (α,n)", uk:"Джерело нейтронів, (α,n)", de:"Neutronenquelle, (α,n)", nl:"Neutronenbron, (α,n)", fr:"Source de neutrons, (α,n)", es:"Fuente de neutrones, (α,n)", pl:"Źródło neutronów, (α,n)"},
  neutron_source_spontaneous_fission: {en:"Neutron source, spontaneous fission", uk:"Джерело нейтронів, спонтанний поділ", de:"Neutronenquelle, Spontanspaltung", nl:"Neutronenbron, spontane splijting", fr:"Source de neutrons, fission spontanée", es:"Fuente de neutrones, fisión espontánea", pl:"Źródło neutronów, rozszczepienie spontaniczne"},
  node_demand: {en:"Node demand", uk:"Витрата у вузлі", de:"Knotenbedarf", nl:"Knooppuntvraag", fr:"Débit au nœud", es:"Demanda en el nudo", pl:"Zapotrzebowanie węzła"},
  node_elevation: {en:"Node elevation", uk:"Відмітка вузла", de:"Knotenhöhe", nl:"Knooppunthoogte", fr:"Altitude du nœud", es:"Cota del nudo", pl:"Rzędna węzła"},
  nominal_voltage: {en:"Nominal voltage", uk:"Номінальна напруга", de:"Nennspannung", nl:"Nominale spanning", fr:"Tension nominale", es:"Tensión nominal", pl:"Napięcie znamionowe"},
  normal_stress: {en:"Normal stress", uk:"Нормальне напруження", de:"Normalspannung", nl:"Normaalspanning", fr:"Contrainte normale", es:"Tensión normal", pl:"Naprężenie normalne"},
  normalisation: {en:"Normalisation basis", uk:"База нормування", de:"Normierungsbasis", nl:"Normeringsbasis", fr:"Base de normalisation", es:"Base de normalización", pl:"Podstawa normalizacji"},
  npsh_margin_m: {en:"NPSH margin", uk:"Запас NPSH", de:"NPSH-Marge", nl:"NPSH-marge", fr:"Marge de NPSH", es:"Margen de NPSH", pl:"Zapas NPSH"},
  npsha_m: {en:"Available NPSH", uk:"Наявний NPSH", de:"Verfügbares NPSH", nl:"Beschikbare NPSH", fr:"NPSH disponible", es:"NPSH disponible", pl:"Dostępne NPSH"},
  npshr_m: {en:"Required NPSH", uk:"Необхідний NPSH", de:"Erforderliches NPSH", nl:"Vereiste NPSH", fr:"NPSH requis", es:"NPSH requerido", pl:"Wymagane NPSH"},
  nu1: {en:"Prandtl-Meyer angle, upstream", uk:"Кут Прандтля–Маєра перед", de:"Prandtl-Meyer-Winkel, stromauf", nl:"Prandtl-Meyer-hoek, voor", fr:"Angle de Prandtl-Meyer amont", es:"Ángulo de Prandtl-Meyer aguas arriba", pl:"Kąt Prandtla-Meyera przed"},
  nu2: {en:"Prandtl-Meyer angle, downstream", uk:"Кут Прандтля–Маєра за", de:"Prandtl-Meyer-Winkel, stromab", nl:"Prandtl-Meyer-hoek, na", fr:"Angle de Prandtl-Meyer aval", es:"Ángulo de Prandtl-Meyer aguas abajo", pl:"Kąt Prandtla-Meyera za"},
  nu_max: {en:"Maximum Prandtl-Meyer angle", uk:"Максимальний кут Прандтля–Маєра", de:"Maximaler Prandtl-Meyer-Winkel", nl:"Maximale Prandtl-Meyer-hoek", fr:"Angle de Prandtl-Meyer maximal", es:"Ángulo de Prandtl-Meyer máximo", pl:"Maksymalny kąt Prandtla-Meyera"},
  nuclides: {en:"Nuclides present", uk:"Присутні нукліди", de:"Vorhandene Nuklide", nl:"Aanwezige nucliden", fr:"Nucléides présents", es:"Nucleidos presentes", pl:"Obecne nuklidy"},
  nxn_neutron_gain: {en:"(n,xn) neutron gain", uk:"Приріст нейтронів (n,xn)", de:"Neutronenzuwachs (n,xn)", nl:"Neutronenwinst (n,xn)", fr:"Gain de neutrons (n,xn)", es:"Ganancia de neutrones (n,xn)", pl:"Przyrost neutronów (n,xn)"},
  objects: {en:"Objects", uk:"Об'єкти", de:"Objekte", nl:"Objecten", fr:"Objets", es:"Objetos", pl:"Obiekty"},
  occupied_zone_humidity: {en:"Occupied zone relative humidity", uk:"Відносна вологість у робочій зоні", de:"Relative Feuchte im Aufenthaltsbereich", nl:"Relatieve vochtigheid verblijfszone", fr:"Humidité relative en zone d'occupation", es:"Humedad relativa en la zona ocupada", pl:"Wilgotność względna w strefie przebywania"},
  occupied_zone_temperature: {en:"Occupied zone temperature", uk:"Температура в робочій зоні", de:"Temperatur im Aufenthaltsbereich", nl:"Temperatuur verblijfszone", fr:"Température en zone d'occupation", es:"Temperatura en la zona ocupada", pl:"Temperatura w strefie przebywania"},
  omega: {en:"Angular frequency", uk:"Кутова частота", de:"Kreisfrequenz", nl:"Hoekfrequentie", fr:"Pulsation (fréquence angulaire)", es:"Frecuencia angular", pl:"Częstość kątowa"},
  open_loop_dead_time: {en:"Open-loop dead time", uk:"Час запізнення розімкненого контуру", de:"Totzeit des offenen Kreises", nl:"Wachttijd open kring", fr:"Retard pur en boucle ouverte", es:"Tiempo muerto en lazo abierto", pl:"Czas martwy układu otwartego"},
  open_loop_den: {en:"Open-loop denominator", uk:"Знаменник розімкненого контуру", de:"Nenner des offenen Kreises", nl:"Noemer open kring", fr:"Dénominateur en boucle ouverte", es:"Denominador en lazo abierto", pl:"Mianownik układu otwartego"},
  open_loop_num: {en:"Open-loop numerator", uk:"Чисельник розімкненого контуру", de:"Zähler des offenen Kreises", nl:"Teller open kring", fr:"Numérateur en boucle ouverte", es:"Numerador en lazo abierto", pl:"Licznik układu otwartego"},
  open_loop_rhp_poles: {en:"Open-loop RHP poles", uk:"RHP-полюси розімкненого контуру", de:"RHP-Pole (offener Kreis)", nl:"RHP-polen (open lus)", fr:"Pôles RHP en boucle ouverte", es:"Polos RHP en lazo abierto", pl:"Bieguny RHP pętli otwartej"},
  openings: {en:"Openings", uk:"Отвори", de:"Öffnungen", nl:"Openingen", fr:"Ouvertures", es:"Aberturas", pl:"Otwory"},
  operating_hours: {en:"Operating hours", uk:"Години роботи", de:"Betriebsstunden", nl:"Bedrijfsuren", fr:"Heures de fonctionnement", es:"Horas de funcionamiento", pl:"Godziny pracy"},
  orientation: {en:"Orientation", uk:"Орієнтація", de:"Ausrichtung", nl:"Oriëntatie", fr:"Orientation", es:"Orientación", pl:"Orientacja"},
  outdoor_dry_bulb: {en:"Outdoor dry-bulb temperature", uk:"Температура зовнішнього повітря (суха)", de:"Außentemperatur (trocken)", nl:"Buitentemperatuur (droge bol)", fr:"Température extérieure sèche", es:"Temperatura exterior de bulbo seco", pl:"Temperatura zewnętrzna termometru suchego"},
  outdoor_relative_humidity: {en:"Outdoor relative humidity", uk:"Відносна вологість зовнішнього повітря", de:"Relative Luftfeuchte außen", nl:"Relatieve vochtigheid buiten", fr:"Humidité relative extérieure", es:"Humedad relativa exterior", pl:"Wilgotność względna powietrza zewnętrznego"},
  outdoor_summer_t: {en:"Outdoor summer temperature", uk:"Зовнішня температура (літо)", de:"Außentemperatur Sommer", nl:"Buitentemperatuur zomer", fr:"Température extérieure d'été", es:"Temperatura exterior de verano", pl:"Temperatura zewnętrzna latem"},
  outdoor_temperature: {en:"Outdoor temperature", uk:"Температура зовнішнього повітря", de:"Außentemperatur", nl:"Buitentemperatuur", fr:"Température extérieure", es:"Temperatura exterior", pl:"Temperatura zewnętrzna"},
  outdoor_winter_t: {en:"Outdoor winter temperature", uk:"Зовнішня температура (зима)", de:"Außentemperatur Winter", nl:"Buitentemperatuur winter", fr:"Température extérieure d'hiver", es:"Temperatura exterior de invierno", pl:"Temperatura zewnętrzna zimą"},
  outflow_volume: {en:"Outflow volume rate", uk:"Об'ємна витрата відтоку", de:"Abluftvolumenstrom", nl:"Volumedebiet uitstroom", fr:"Débit volumique sortant", es:"Caudal volumétrico saliente", pl:"Strumień objętości odpływu"},
  outlet_setpoint: {en:"Outlet temperature setpoint", uk:"Уставка температури на виході", de:"Sollwert Austrittstemperatur", nl:"Setpoint uittredetemperatuur", fr:"Consigne de température de sortie", es:"Consigna de temperatura de salida", pl:"Nastawa temperatury wylotowej"},
  overshoot_abs: {en:"Overshoot (absolute)", uk:"Перерегулювання (абсолютне)", de:"Überschwingen (absolut)", nl:"Overshoot (absoluut)", fr:"Dépassement (absolu)", es:"Sobreimpulso (absoluto)", pl:"Przeregulowanie (bezwzględne)"},
  overshoot_pct: {en:"Overshoot", uk:"Перерегулювання", de:"Überschwingen", nl:"Overshoot", fr:"Dépassement", es:"Sobreimpulso", pl:"Przeregulowanie"},
  p: [{u:["Pa","kPa","MPa","bar","bar(a)","bar(g)","atm","psi"], en:"Pressure", uk:"Тиск", de:"Druck", nl:"Druk", fr:"Pression", es:"Presión", pl:"Ciśnienie"}],
  p0: {en:"Initial pressure", uk:"Початковий тиск", de:"Anfangsdruck", nl:"Beginddruk", fr:"Pression initiale", es:"Presión inicial", pl:"Ciśnienie początkowe"},
  p02_p01: {en:"p0 ratio across shock (p02/p01)", uk:"Відношення p0 на скачку (p02/p01)", de:"p0-Verhältnis am Stoß (p02/p01)", nl:"p0-verhouding over de schok (p02/p01)", fr:"Rapport p0 au choc (p02/p01)", es:"Relación p0 en el choque (p02/p01)", pl:"Stosunek p0 na fali (p02/p01)"},
  p0_ratio: {en:"Stagnation-pressure ratio", uk:"Відношення тисків гальмування", de:"Ruhedruckverhältnis", nl:"Stagnatiedrukverhouding", fr:"Rapport des pressions d'arrêt", es:"Relación de presiones de remanso", pl:"Stosunek ciśnień spiętrzenia"},
  p1: {en:"Inlet pressure", uk:"Тиск на вході", de:"Eintrittsdruck", nl:"Intrededruk", fr:"Pression d'entrée", es:"Presión de entrada", pl:"Ciśnienie na wlocie"},
  p2_p1: {en:"Pressure ratio across shock", uk:"Відношення тисків на скачку", de:"Druckverhältnis am Stoß", nl:"Drukverhouding over de schok", fr:"Rapport de pression au choc", es:"Relación de presiones en el choque", pl:"Stosunek ciśnień na fali uderzeniowej"},
  pSupply: {en:"Supply pressure", uk:"Тиск подачі", de:"Versorgungsdruck", nl:"Voedingsdruk", fr:"Pression d'alimentation", es:"Presión de suministro", pl:"Ciśnienie zasilania"},
  p_crit: {en:"Critical pressure", uk:"Критичний тиск", de:"Kritischer Druck", nl:"Kritische druk", fr:"Pression critique", es:"Presión crítica", pl:"Ciśnienie krytyczne"},
  p_display_unit: {en:"Pressure display unit", uk:"Одиниця відображення тиску", de:"Anzeigeeinheit für Druck", nl:"Weergave-eenheid druk", fr:"Unité d'affichage de la pression", es:"Unidad de visualización de presión", pl:"Jednostka wyświetlania ciśnienia"},
  p_final: {en:"Final pressure", uk:"Кінцевий тиск", de:"Enddruck", nl:"Einddruk", fr:"Pression finale", es:"Presión final", pl:"Ciśnienie końcowe"},
  p_in: {en:"Inlet pressure", uk:"Тиск на вході", de:"Eintrittsdruck", nl:"Intrededruk", fr:"Pression d'entrée", es:"Presión de entrada", pl:"Ciśnienie na wlocie"},
  p_out: {en:"Outlet pressure", uk:"Тиск на виході", de:"Austrittsdruck", nl:"Uittrededruk", fr:"Pression de sortie", es:"Presión de salida", pl:"Ciśnienie na wylocie"},
  p_p0_subsonic: {en:"p/p0, subsonic branch", uk:"p/p0, дозвукова гілка", de:"p/p0, Unterschall-Ast", nl:"p/p0, subsone tak", fr:"p/p0, branche subsonique", es:"p/p0, rama subsónica", pl:"p/p0, gałąź poddźwiękowa"},
  p_p0_supersonic: {en:"p/p0, supersonic branch", uk:"p/p0, надзвукова гілка", de:"p/p0, Überschall-Ast", nl:"p/p0, supersone tak", fr:"p/p0, branche supersonique", es:"p/p0, rama supersónica", pl:"p/p0, gałąź naddźwiękowa"},
  pb: {en:"Back pressure", uk:"Тиск на противотиску (протитиск)", de:"Gegendruck", nl:"Tegendruk", fr:"Contre-pression", es:"Contrapresión", pl:"Ciśnienie przeciwdziałające"},
  peak_current_A: {en:"Peak current", uk:"Ударний струм", de:"Stoßstrom", nl:"Piekstroom", fr:"Courant de crête", es:"Corriente de pico", pl:"Prąd udarowy"},
  peak_ratio_thermal_fast: {en:"Thermal-to-fast peak ratio", uk:"Відношення теплового піку до швидкого", de:"Verhältnis thermischer zu schnellem Peak", nl:"Verhouding thermische/snelle piek", fr:"Rapport pic thermique/rapide", es:"Relación pico térmico/rápido", pl:"Stosunek piku termicznego do szybkiego"},
  people: {en:"Occupants", uk:"Кількість людей", de:"Personenzahl", nl:"Aantal personen", fr:"Nombre de personnes", es:"Número de personas", pl:"Liczba osób"},
  period: {en:"Reactor period", uk:"Період реактора", de:"Reaktorperiode", nl:"Reactorperiode", fr:"Période du réacteur", es:"Periodo del reactor", pl:"Okres reaktora"},
  pf_type: {en:"Power factor type", uk:"Тип коефіцієнта потужності", de:"Art des Leistungsfaktors", nl:"Type arbeidsfactor", fr:"Type de facteur de puissance", es:"Tipo de factor de potencia", pl:"Rodzaj współczynnika mocy"},
  phase_crossover_w: {en:"Phase crossover frequency (ω)", uk:"Частота зрізу за фазою (ω)", de:"Phasendurchtrittsfrequenz (ω)", nl:"Kantelfrequentie fase (ω)", fr:"Pulsation de coupure en phase (ω)", es:"Frecuencia de cruce de fase (ω)", pl:"Częstość przecięcia fazy (ω)"},
  phase_margin_deg: {en:"Phase margin", uk:"Запас стійкості за фазою", de:"Phasenrand", nl:"Fasemarge", fr:"Marge de phase", es:"Margen de fase", pl:"Zapas fazy"},
  phi: [{u:"n/cm2/s", en:"Neutron flux (φ)", uk:"Потік нейтронів (φ)", de:"Neutronenfluss (φ)", nl:"Neutronenflux (φ)", fr:"Flux neutronique (φ)", es:"Flujo neutrónico (φ)", pl:"Strumień neutronów (φ)"}],
  photon_energy_source: {en:"Photon energy source", uk:"Джерело енергії фотонів", de:"Photonenenergiequellstärke", nl:"Fotonenergiebron", fr:"Source d'énergie des photons", es:"Fuente de energía de fotones", pl:"Źródło energii fotonów"},
  photon_source: {en:"Photon source", uk:"Джерело фотонів", de:"Photonenquellstärke", nl:"Fotonbron", fr:"Source de photons", es:"Fuente de fotones", pl:"Źródło fotonów"},
  physical_mass_kg: {en:"Physical mass", uk:"Фізична маса", de:"Physikalische Masse", nl:"Fysieke massa", fr:"Masse physique", es:"Masa física", pl:"Masa fizyczna"},
  pipeD: {en:"Pipe diameter", uk:"Діаметр труби", de:"Rohrdurchmesser", nl:"Leidingdiameter", fr:"Diamètre de la conduite", es:"Diámetro de la tubería", pl:"Średnica rurociągu"},
  pipeL: {en:"Pipe length", uk:"Довжина труби", de:"Rohrlänge", nl:"Leidinglengte", fr:"Longueur de la conduite", es:"Longitud de la tubería", pl:"Długość rurociągu"},
  pipe_diameter_m: {en:"Pipe diameter", uk:"Діаметр труби", de:"Rohrdurchmesser", nl:"Leidingdiameter", fr:"Diamètre de la conduite", es:"Diámetro de la tubería", pl:"Średnica rurociągu"},
  pipe_length: {en:"Pipe length", uk:"Довжина труби", de:"Rohrlänge", nl:"Leidinglengte", fr:"Longueur de la conduite", es:"Longitud de la tubería", pl:"Długość rurociągu"},
  pipe_material: {en:"Pipe material", uk:"Матеріал труби", de:"Rohrmaterial", nl:"Leidingmateriaal", fr:"Matériau de la conduite", es:"Material de la tubería", pl:"Materiał rurociągu"},
  plateau_flatness: {en:"Epithermal plateau flatness", uk:"Рівність епітеплового плато", de:"Ebenheit des epithermischen Plateaus", nl:"Vlakheid epithermisch plateau", fr:"Planéité du plateau épithermique", es:"Planitud de la meseta epitérmica", pl:"Płaskość plateau epitermicznego"},
  poa_after_incidence_angle: {en:"POA irradiance after incidence-angle loss", uk:"Опромінення POA з урахуванням кута падіння", de:"POA-Einstrahlung nach Einfallswinkelverlust", nl:"POA-bestraling na inval verlies", fr:"Irradiance POA après perte d'angle d'incidence", es:"Irradiancia POA tras pérdida por ángulo de incidencia", pl:"Napromieniowanie POA po stratach kąta padania"},
  poa_irradiance: {en:"Plane-of-array irradiance (POA)", uk:"Опромінення в площині приймача (POA)", de:"Einstrahlung in Kollektorebene (POA)", nl:"Bestraling in vlak van collector (POA)", fr:"Irradiance dans le plan du capteur (POA)", es:"Irradiancia en el plano del captador (POA)", pl:"Napromieniowanie w płaszczyźnie kolektora (POA)"},
  power: {en:"Power", uk:"Потужність", de:"Leistung", nl:"Vermogen", fr:"Puissance", es:"Potencia", pl:"Moc"},
  power_basis: {en:"Power basis", uk:"Основа для потужності", de:"Leistungsbezug", nl:"Vermogensbasis", fr:"Base de puissance", es:"Base de potencia", pl:"Podstawa mocy"},
  power_factor: {en:"Power factor", uk:"Коефіцієнт потужності", de:"Leistungsfaktor", nl:"Arbeidsfactor", fr:"Facteur de puissance", es:"Factor de potencia", pl:"Współczynnik mocy"},
  power_setpoint: {en:"Power setpoint", uk:"Уставка потужності", de:"Leistungssollwert", nl:"Vermogenssetpoint", fr:"Consigne de puissance", es:"Consigna de potencia", pl:"Nastawa mocy"},
  preset: {en:"Preset", uk:"Пресет", de:"Voreinstellung", nl:"Voorinstelling", fr:"Préréglage", es:"Preajuste", pl:"Ustawienie predefiniowane"},
  pressure: {en:"Pressure", uk:"Тиск", de:"Druck", nl:"Druk", fr:"Pression", es:"Presión", pl:"Ciśnienie"},
  pressure_balance: {en:"Pressure balance", uk:"Баланс тиску", de:"Druckausgleich", nl:"Drukbalans", fr:"Équilibre de pression", es:"Equilibrio de presión", pl:"Bilans ciśnienia"},
  pressure_high: {en:"High pressure", uk:"Високий тиск", de:"Hochdruck", nl:"Hoge druk", fr:"Haute pression", es:"Presión alta", pl:"Ciśnienie wysokie"},
  pressure_intermediate: {en:"Intermediate pressure", uk:"Проміжний тиск", de:"Mitteldruck", nl:"Middendruk", fr:"Pression intermédiaire", es:"Presión intermedia", pl:"Ciśnienie pośrednie"},
  pressure_low: {en:"Low pressure", uk:"Низький тиск", de:"Niederdruck", nl:"Lage druk", fr:"Basse pression", es:"Presión baja", pl:"Ciśnienie niskie"},
  principal_strain_1: {en:"Principal strain 1", uk:"Головна деформація 1", de:"Hauptdehnung 1", nl:"Hoofdrek 1", fr:"Déformation principale 1", es:"Deformación principal 1", pl:"Odkształcenie główne 1"},
  probe_height: {en:"Probe height", uk:"Висота точки вимірювання", de:"Höhe des Messpunkts", nl:"Hoogte meetpunt", fr:"Hauteur du point de mesure", es:"Altura de la sonda", pl:"Wysokość punktu pomiaru"},
  probe_region: {en:"Probe (tally) region", uk:"Область детектора (тела)", de:"Sonden-(Tally-)Region", nl:"Meetgebied (tally)", fr:"Région de sonde (tally)", es:"Región de sonda (tally)", pl:"Obszar detektora (zliczeń)"},
  process_model: {en:"Process model", uk:"Модель процесу", de:"Prozessmodell", nl:"Procesmodel", fr:"Modèle de procédé", es:"Modelo del proceso", pl:"Model procesu"},
  promptMargin: {en:"Margin to prompt criticality", uk:"Запас до миттєвої критичності", de:"Abstand zur promptkritischen Grenze", nl:"Marge tot promptkritisch", fr:"Marge à la criticité prompte", es:"Margen a la criticidad pronta", pl:"Margines do krytyczności natychmiastowej"},
  proper_time_light_clock: {en:"Light-clock proper time (τ)", uk:"Власний час світлового годинника (τ)", de:"Eigenzeit der Lichtuhr (τ)", nl:"Eigentijd lichtklok (τ)", fr:"Temps propre de l'horloge lumineuse (τ)", es:"Tiempo propio del reloj de luz (τ)", pl:"Czas własny zegara świetlnego (τ)"},
  property_1: {en:"First state property", uk:"Перша визначальна властивість", de:"Erste Zustandsgröße", nl:"Eerste toestandseigenschap", fr:"Première propriété d'état", es:"Primera propiedad de estado", pl:"Pierwsza właściwość stanu"},
  property_2: {en:"Second state property", uk:"Друга визначальна властивість", de:"Zweite Zustandsgröße", nl:"Tweede toestandseigenschap", fr:"Seconde propriété d'état", es:"Segunda propiedad de estado", pl:"Druga właściwość stanu"},
  property_uncertainty: {en:"Fluid property uncertainty", uk:"Невизначеність властивостей рідини", de:"Unsicherheit der Stoffwerte", nl:"Onzekerheid vloeistofeigenschappen", fr:"Incertitude des propriétés du fluide", es:"Incertidumbre de las propiedades del fluido", pl:"Niepewność właściwości płynu"},
  pump_efficiency: {en:"Pump efficiency", uk:"ККД насоса", de:"Pumpenwirkungsgrad", nl:"Pomprendement", fr:"Rendement de la pompe", es:"Rendimiento de la bomba", pl:"Sprawność pompy"},
  pump_flow: {en:"Pump flow rate", uk:"Витрата насоса", de:"Pumpenvolumenstrom", nl:"Pompdebiet", fr:"Débit de la pompe", es:"Caudal de la bomba", pl:"Wydajność pompy"},
  pump_head: {en:"Pump head", uk:"Напір насоса", de:"Pumpenförderhöhe", nl:"Pompopvoerhoogte", fr:"Hauteur manométrique de la pompe", es:"Altura de la bomba", pl:"Wysokość podnoszenia pompy"},
  pump_isentropic_efficiency: {en:"Pump isentropic efficiency", uk:"Ізентропний ККД насоса", de:"Isentroper Pumpenwirkungsgrad", nl:"Isentropisch pomprendement", fr:"Rendement isentropique de la pompe", es:"Rendimiento isentrópico de la bomba", pl:"Sprawność izentropowa pompy"},
  pump_power: {en:"Pump power", uk:"Потужність насоса", de:"Pumpenleistung", nl:"Pompvermogen", fr:"Puissance de la pompe", es:"Potencia de la bomba", pl:"Moc pompy"},
  pumps_parallel: {en:"Pumps in parallel", uk:"Кількість насосів паралельно", de:"Pumpen parallel", nl:"Pompen parallel", fr:"Pompes en parallèle", es:"Bombas en paralelo", pl:"Pompy równoległe"},
  purchased_electricity: {en:"Purchased electricity", uk:"Куплена електроенергія", de:"Bezogener Strom", nl:"Ingekochte elektriciteit", fr:"Électricité achetée", es:"Electricidad comprada", pl:"Zakupiona energia elektryczna"},
  pv_ac_power: {en:"PV AC power", uk:"Потужність PV змінного струму", de:"PV-Wechselstromleistung", nl:"PV-wisselstroomvermogen", fr:"Puissance photovoltaïque alternative", es:"Potencia fotovoltaica en CA", pl:"Moc PV prądu przemiennego"},
  pv_capacity: {en:"PV capacity", uk:"Потужність СЕС", de:"PV-Leistung", nl:"PV-vermogen", fr:"Puissance photovoltaïque", es:"Potencia fotovoltaica", pl:"Moc instalacji PV"},
  pv_dc_power: {en:"PV DC power", uk:"Потужність PV постійного струму", de:"PV-Gleichstromleistung", nl:"PV-gelijkstroomvermogen", fr:"Puissance photovoltaïque continue", es:"Potencia fotovoltaica en CC", pl:"Moc PV prądu stałego"},
  pv_efficiency: {en:"PV module efficiency", uk:"ККД фотоелектричного модуля", de:"Wirkungsgrad PV-Modul", nl:"Rendement PV-module", fr:"Rendement du module photovoltaïque", es:"Rendimiento del módulo fotovoltaico", pl:"Sprawność modułu PV"},
  pv_enabled: {en:"PV enabled", uk:"Увімкнено фотовольтаїку", de:"PV aktiviert", nl:"PV ingeschakeld", fr:"Photovoltaïque activé", es:"Fotovoltaica activada", pl:"Fotowoltaika włączona"},
  pv_mounting: {en:"PV mounting type", uk:"Тип монтажу PV", de:"PV-Montageart", nl:"PV-montagewijze", fr:"Type de pose photovoltaïque", es:"Tipo de montaje fotovoltaico", pl:"Sposób montażu PV"},
  pv_system_losses: {en:"PV system losses", uk:"Системні втрати PV", de:"PV-Systemverluste", nl:"PV-systeemverliezen", fr:"Pertes système photovoltaïque", es:"Pérdidas del sistema fotovoltaico", pl:"Straty systemowe PV"},
  pv_temperature_coefficient: {en:"PV temperature coefficient (γ)", uk:"Температурний коефіцієнт PV (γ)", de:"PV-Temperaturkoeffizient (γ)", nl:"PV-temperatuurcoëfficiënt (γ)", fr:"Coefficient de température photovoltaïque (γ)", es:"Coeficiente de temperatura fotovoltaico (γ)", pl:"Współczynnik temperaturowy PV (γ)"},
  q_choke: {en:"Heat addition to choking", uk:"Тепло до запирання потоку", de:"Wärmezufuhr bis zur Verblockung", nl:"Warmtetoevoer tot verstopping", fr:"Chaleur ajoutée jusqu'au blocage", es:"Calor añadido hasta el bloqueo", pl:"Ciepło doprowadzone do zadławienia"},
  q_source: {en:"Heat source", uk:"Джерело тепла", de:"Wärmequelle", nl:"Warmtebron", fr:"Source de chaleur", es:"Fuente de calor", pl:"Źródło ciepła"},
  quality: {en:"Vapour quality", uk:"Сухість пари", de:"Dampfgehalt", nl:"Dampkwaliteit", fr:"Titre vapeur", es:"Título de vapor", pl:"Stopień suchości pary"},
  radar: {en:"Radar-ranging scenario", uk:"Сценарій радіолокаційного вимірювання", de:"Radar-Entfernungsmessung", nl:"Radar-afstandsscenario", fr:"Scénario de télémétrie radar", es:"Escenario de telemetría radar", pl:"Scenariusz pomiaru radarowego"},
  radiation: {en:"Radiation enabled", uk:"Врахування випромінювання", de:"Strahlung aktiviert", nl:"Straling ingeschakeld", fr:"Rayonnement activé", es:"Radiación activada", pl:"Uwzględnienie promieniowania"},
  random_seed: {en:"Random seed", uk:"Початкове значення генератора", de:"Zufallsstartwert", nl:"Random seed", fr:"Graine aléatoire", es:"Semilla aleatoria", pl:"Ziarno generatora losowego"},
  rankine_utilization: {en:"Rankine utilization ratio", uk:"Коефіцієнт використання за Ренкіном", de:"Ausnutzungsgrad nach Rankine", nl:"Benuttingsgraad volgens Rankine", fr:"Taux d'utilisation de Rankine", es:"Grado de utilización de Rankine", pl:"Stopień wykorzystania wg Rankine'a"},
  rapidity: {en:"Rapidity (φ)", uk:"Бистрота (φ)", de:"Rapidität (φ)", nl:"Rapiditeit (φ)", fr:"Rapidité (φ)", es:"Rapidez relativista (φ)", pl:"Rapidity (φ)"},
  reactance: {en:"Reactance", uk:"Реактивний опір", de:"Reaktanz", nl:"Reactantie", fr:"Réactance", es:"Reactancia", pl:"Reaktancja"},
  reactivity: {en:"Reactivity", uk:"Реактивність", de:"Reaktivität", nl:"Reactiviteit", fr:"Réactivité", es:"Reactividad", pl:"Reaktywność"},
  reactivity_dollars: {en:"Reactivity (dollars)", uk:"Реактивність (у доларах)", de:"Reaktivität (Dollar)", nl:"Reactiviteit (dollar)", fr:"Réactivité (en dollars)", es:"Reactividad (en dólares)", pl:"Reaktywność (w dolarach)"},
  receiver_spl_db: {en:"Receiver sound pressure level", uk:"Рівень звукового тиску в приймачі", de:"Schalldruckpegel am Empfänger", nl:"Geluidsdrukniveau bij ontvanger", fr:"Niveau de pression acoustique au récepteur", es:"Nivel de presión sonora en el receptor", pl:"Poziom ciśnienia akustycznego u odbiorcy"},
  recommended_strategy: {en:"Recommended strategy", uk:"Рекомендована стратегія", de:"Empfohlene Strategie", nl:"Aanbevolen strategie", fr:"Stratégie recommandée", es:"Estrategia recomendada", pl:"Zalecana strategia"},
  reference_density: {en:"Reference air density", uk:"Довідкова густина повітря", de:"Referenzluftdichte", nl:"Referentieluchtdichtheid", fr:"Masse volumique de référence", es:"Densidad de aire de referencia", pl:"Referencyjna gęstość powietrza"},
  reference_height: {en:"Reference height", uk:"Висота приведення", de:"Bezugshöhe", nl:"Referentiehoogte", fr:"Hauteur de référence", es:"Altura de referencia", pl:"Wysokość odniesienia"},
  regime: {en:"Flow regime", uk:"Режим течії", de:"Strömungsregime", nl:"Stromingsregime", fr:"Régime d'écoulement", es:"Régimen de flujo", pl:"Reżim przepływu"},
  region: {en:"IAPWS region", uk:"Область IAPWS", de:"IAPWS-Bereich", nl:"IAPWS-gebied", fr:"Région IAPWS", es:"Región IAPWS", pl:"Obszar IAPWS"},
  regions: {en:"Number of regions", uk:"Кількість областей", de:"Anzahl der Regionen", nl:"Aantal regio's", fr:"Nombre de régions", es:"Número de regiones", pl:"Liczba obszarów"},
  register_category: {en:"Register category", uk:"Категорія реєстру", de:"Registerkategorie", nl:"Registercategorie", fr:"Catégorie du registre", es:"Categoría del registro", pl:"Kategoria rejestru"},
  register_query: {en:"Register search query", uk:"Пошуковий запит реєстру", de:"Registersuche", nl:"Registerzoekopdracht", fr:"Requête de recherche du registre", es:"Consulta de búsqueda del registro", pl:"Zapytanie wyszukiwania w rejestrze"},
  reheat_pressure: {en:"Reheat pressure", uk:"Тиск проміжного перегріву", de:"Zwischenüberhitzungsdruck", nl:"Tussenoververhittingsdruk", fr:"Pression de resurchauffe", es:"Presión de recalentamiento", pl:"Ciśnienie międzystopniowego przegrzewu"},
  reheat_temperature: {en:"Reheat temperature", uk:"Температура проміжного перегріву", de:"Zwischenüberhitzungstemperatur", nl:"Tussenoververhittingstemperatuur", fr:"Température de resurchauffe", es:"Temperatura de recalentamiento", pl:"Temperatura międzystopniowego przegrzewu"},
  relative_humidity: {en:"Relative humidity", uk:"Відносна вологість", de:"Relative Luftfeuchte", nl:"Relatieve vochtigheid", fr:"Humidité relative", es:"Humedad relativa", pl:"Wilgotność względna"},
  relative_roughness: {en:"Relative roughness", uk:"Відносна шорсткість", de:"Relative Rauheit", nl:"Relatieve ruwheid", fr:"Rugosité relative", es:"Rugosidad relativa", pl:"Chropowatość względna"},
  required_aerodynamic_area: {en:"Required aerodynamic vent area", uk:"Необхідна аеродинамічна площа вентиляції", de:"Erforderliche aerodynamische Öffnungsfläche", nl:"Vereiste aerodynamische rookafvoeroppervlakte", fr:"Surface aérodynamique d'évacuation requise", es:"Superficie aerodinámica de evacuación requerida", pl:"Wymagana powierzchnia aerodynamiczna wywiewu"},
  required_airflow: {en:"Required airflow", uk:"Необхідна витрата повітря", de:"Erforderlicher Luftvolumenstrom", nl:"Vereist luchtdebiet", fr:"Débit d'air requis", es:"Caudal de aire requerido", pl:"Wymagany przepływ powietrza"},
  required_duty: {en:"Required duty", uk:"Необхідна теплова потужність", de:"Erforderliche Leistung", nl:"Vereist vermogen", fr:"Puissance requise", es:"Potencia requerida", pl:"Wymagana moc"},
  required_inlet_area: {en:"Required inlet area", uk:"Необхідна площа припливу", de:"Erforderliche Zuluftfläche", nl:"Vereiste toevoeroppervlakte", fr:"Surface d'amenée d'air requise", es:"Superficie de entrada de aire requerida", pl:"Wymagana powierzchnia dopływu powietrza"},
  required_inlet_area_mass_balance: {en:"Required inlet area (mass balance)", uk:"Необхідна площа припливу (баланс мас)", de:"Erforderliche Zuluftfläche (Massenbilanz)", nl:"Vereiste toevoeroppervlakte (massabalans)", fr:"Surface d'amenée d'air requise (bilan massique)", es:"Superficie de entrada de aire requerida (balance de masa)", pl:"Wymagana powierzchnia dopływu powietrza (bilans masy)"},
  reservoir_area: {en:"Reservoir area", uk:"Площа резервуара диму", de:"Fläche des Rauchabschnitts", nl:"Rookreservoiroppervlakte", fr:"Surface du réservoir de fumée", es:"Superficie del depósito de humos", pl:"Powierzchnia zbiornika dymu"},
  reservoirs: {en:"Reservoirs", uk:"Кількість резервуарів диму", de:"Anzahl Rauchabschnitte", nl:"Aantal rookreservoirs", fr:"Nombre de réservoirs de fumée", es:"Número de depósitos de humos", pl:"Liczba zbiorników dymu"},
  resonance_integral: {en:"Resonance integral", uk:"Резонансний інтеграл", de:"Resonanzintegral", nl:"Resonantie-integraal", fr:"Intégrale de résonance", es:"Integral de resonancia", pl:"Całka rezonansowa"},
  return_temperature: {en:"Return temperature", uk:"Температура зворотної води", de:"Rücklauftemperatur", nl:"Retourtemperatuur", fr:"Température de retour", es:"Temperatura de retorno", pl:"Temperatura powrotu"},
  reynolds: {en:"Reynolds number", uk:"Число Рейнольдса", de:"Reynolds-Zahl", nl:"Reynoldsgetal", fr:"Nombre de Reynolds", es:"Número de Reynolds", pl:"Liczba Reynoldsa"},
  reynolds_initial: {en:"Initial Reynolds number", uk:"Початкове число Рейнольдса", de:"Anfängliche Reynolds-Zahl", nl:"Aanvankelijk Reynoldsgetal", fr:"Nombre de Reynolds initial", es:"Número de Reynolds inicial", pl:"Początkowa liczba Reynoldsa"},
  rh_e: {en:"External relative humidity", uk:"Зовнішня відносна вологість", de:"Relative Luftfeuchte außen", nl:"Relatieve vochtigheid buiten", fr:"Humidité relative extérieure", es:"Humedad relativa exterior", pl:"Wilgotność względna zewnętrzna"},
  rh_i: {en:"Internal relative humidity", uk:"Внутрішня відносна вологість", de:"Relative Luftfeuchte innen", nl:"Relatieve vochtigheid binnen", fr:"Humidité relative intérieure", es:"Humedad relativa interior", pl:"Wilgotność względna wewnętrzna"},
  rh_outdoor: {en:"Outdoor relative humidity", uk:"Відносна вологість зовнішнього повітря", de:"Relative Luftfeuchte außen", nl:"Relatieve vochtigheid buiten", fr:"Humidité relative extérieure", es:"Humedad relativa exterior", pl:"Wilgotność względna powietrza zewnętrznego"},
  rh_start: {en:"Initial relative humidity", uk:"Початкова відносна вологість", de:"Anfängliche relative Luftfeuchte", nl:"Initiële relatieve vochtigheid", fr:"Humidité relative initiale", es:"Humedad relativa inicial", pl:"Początkowa wilgotność względna"},
  rho: {en:"Density", uk:"Густина", de:"Dichte", nl:"Dichtheid", fr:"Masse volumique", es:"Densidad", pl:"Gęstość"},
  rhoCoolant: {en:"Coolant reactivity", uk:"Реактивність теплоносія", de:"Kühlmittelreaktivität", nl:"Koelmiddelreactiviteit", fr:"Réactivité du caloporteur", es:"Reactividad del refrigerante", pl:"Reaktywność chłodziwa"},
  rhoCtrl: {en:"Control-rod reactivity", uk:"Реактивність регулювальних стрижнів", de:"Reaktivität der Regelstäbe", nl:"Reactiviteit regelstaven", fr:"Réactivité des barres de commande", es:"Reactividad de las barras de control", pl:"Reaktywność prętów regulacyjnych"},
  rhoDollar: {en:"Reactivity in dollars (ρ/βeff)", uk:"Реактивність у доларах (ρ/βeff)", de:"Reaktivität in Dollar (ρ/βeff)", nl:"Reactiviteit in dollars (ρ/βeff)", fr:"Réactivité en dollars (ρ/βeff)", es:"Reactividad en dólares (ρ/βeff)", pl:"Reaktywność w dolarach (ρ/βeff)"},
  rhoDoppler: {en:"Doppler reactivity", uk:"Доплерівська реактивність", de:"Doppler-Reaktivität", nl:"Dopplerreactiviteit", fr:"Réactivité Doppler", es:"Reactividad Doppler", pl:"Reaktywność dopplerowska"},
  rhoRodAbsorber: {en:"Absorber-section rod reactivity", uk:"Реактивність поглинальної секції стрижня", de:"Reaktivität des Absorberabschnitts", nl:"Reactiviteit absorbersectie staaf", fr:"Réactivité de la section absorbante", es:"Reactividad de la sección absorbente", pl:"Reaktywność sekcji pochłaniającej pręta"},
  rhoRodTip: {en:"Rod-tip reactivity", uk:"Реактивність кінчика стрижня", de:"Reaktivität der Stabspitze", nl:"Reactiviteit staafpunt", fr:"Réactivité de l'extrémité de barre", es:"Reactividad de la punta de barra", pl:"Reaktywność końcówki pręta"},
  rhoTotal: {en:"Total reactivity", uk:"Сумарна реактивність", de:"Gesamtreaktivität", nl:"Totale reactiviteit", fr:"Réactivité totale", es:"Reactividad total", pl:"Reaktywność całkowita"},
  rhoVoid: {en:"Void reactivity", uk:"Реактивність за пустотами", de:"Voidreaktivität", nl:"Voidreactiviteit", fr:"Réactivité de vide", es:"Reactividad de vacío", pl:"Reaktywność pustkowa"},
  rhoXe: {en:"Xenon reactivity", uk:"Ксенонова реактивність", de:"Xenon-Reaktivität", nl:"Xenonreactiviteit", fr:"Réactivité xénon", es:"Reactividad del xenón", pl:"Reaktywność ksenonowa"},
  rho_final: {en:"Final density", uk:"Кінцева густина", de:"Enddichte", nl:"Einddichtheid", fr:"Masse volumique finale", es:"Densidad final", pl:"Gęstość końcowa"},
  rho_rho0_subsonic: {en:"ρ/ρ0, subsonic branch", uk:"ρ/ρ0, дозвукова гілка", de:"ρ/ρ0, Unterschall-Ast", nl:"ρ/ρ0, subsone tak", fr:"ρ/ρ0, branche subsonique", es:"ρ/ρ0, rama subsónica", pl:"ρ/ρ0, gałąź poddźwiękowa"},
  rho_rho0_supersonic: {en:"ρ/ρ0, supersonic branch", uk:"ρ/ρ0, надзвукова гілка", de:"ρ/ρ0, Überschall-Ast", nl:"ρ/ρ0, supersone tak", fr:"ρ/ρ0, branche supersonique", es:"ρ/ρ0, rama supersónica", pl:"ρ/ρ0, gałąź naddźwiękowa"},
  rod: {en:"Moving rod", uk:"Рухомий стрижень", de:"Bewegter Stab", nl:"Bewegende staaf", fr:"Tige en mouvement", es:"Varilla en movimiento", pl:"Poruszający się pręt"},
  rodSlopePcmPerU: {en:"Rod worth slope (pcm per unit)", uk:"Нахил цінності стрижня (pcm на одиницю)", de:"Wertsteigung des Stabs (pcm je Einheit)", nl:"Staafwaarde-helling (pcm per eenheid)", fr:"Pente d'efficacité de la barre (pcm par unité)", es:"Pendiente de valía de barra (pcm por unidad)", pl:"Nachylenie wartości pręta (pcm na jednostkę)"},
  rod_reg: {en:"Regulating rod position", uk:"Положення регулювального стрижня", de:"Stellung des Regelstabs", nl:"Positie regelstaaf", fr:"Position de la barre de réglage", es:"Posición de la barra reguladora", pl:"Położenie pręta regulacyjnego"},
  rod_tipd: {en:"Rod-tip travel rate", uk:"Швидкість переміщення кінчика стрижня", de:"Verfahrgeschwindigkeit der Stabspitze", nl:"Verplaatsingssnelheid staafpunt", fr:"Vitesse de déplacement de l'extrémité de barre", es:"Velocidad de desplazamiento de la punta de barra", pl:"Prędkość przesuwu końcówki pręta"},
  roof_gain: {en:"Roof heat gain", uk:"Теплонадходження через дах", de:"Wärmegewinn durch das Dach", nl:"Warmtewinst via dak", fr:"Gain thermique par la toiture", es:"Ganancia térmica por la cubierta", pl:"Zysk ciepła przez dach"},
  roof_solar_load: {en:"Roof solar load", uk:"Сонячне навантаження через дах", de:"Solarlast über das Dach", nl:"Zonnelast via dak", fr:"Charge solaire par la toiture", es:"Carga solar por cubierta", pl:"Obciążenie słoneczne przez dach"},
  roof_u_value: {en:"Roof U-value", uk:"Коефіцієнт теплопередачі даху", de:"U-Wert Dach", nl:"U-waarde dak", fr:"Coefficient U de la toiture", es:"Valor U de la cubierta", pl:"Współczynnik U dachu"},
  room: {en:"Room", uk:"Приміщення", de:"Raum", nl:"Ruimte", fr:"Local", es:"Local", pl:"Pomieszczenie"},
  room_H: {en:"Room height", uk:"Висота приміщення", de:"Raumhöhe", nl:"Ruimtehoogte", fr:"Hauteur du local", es:"Altura del local", pl:"Wysokość pomieszczenia"},
  room_L: {en:"Room length", uk:"Довжина приміщення", de:"Raumlänge", nl:"Ruimtelengte", fr:"Longueur du local", es:"Longitud del local", pl:"Długość pomieszczenia"},
  room_W: {en:"Room width", uk:"Ширина приміщення", de:"Raumbreite", nl:"Ruimtebreedte", fr:"Largeur du local", es:"Anchura del local", pl:"Szerokość pomieszczenia"},
  room_height: {en:"Room height", uk:"Висота приміщення", de:"Raumhöhe", nl:"Ruimtehoogte", fr:"Hauteur du local", es:"Altura del local", pl:"Wysokość pomieszczenia"},
  room_length: {en:"Room length", uk:"Довжина приміщення", de:"Raumlänge", nl:"Ruimtelengte", fr:"Longueur du local", es:"Longitud del local", pl:"Długość pomieszczenia"},
  room_volume: {en:"Room volume", uk:"Об'єм приміщення", de:"Raumvolumen", nl:"Ruimtevolume", fr:"Volume du local", es:"Volumen del local", pl:"Objętość pomieszczenia"},
  room_width: {en:"Room width", uk:"Ширина приміщення", de:"Raumbreite", nl:"Ruimtebreedte", fr:"Largeur du local", es:"Anchura del local", pl:"Szerokość pomieszczenia"},
  roughness: {en:"Roughness", uk:"Шорсткість", de:"Rauheit", nl:"Ruwheid", fr:"Rugosité", es:"Rugosidad", pl:"Chropowatość"},
  roughness_eps: {en:"Roughness (ε)", uk:"Шорсткість (ε)", de:"Rauheit (ε)", nl:"Ruwheid (ε)", fr:"Rugosité (ε)", es:"Rugosidad (ε)", pl:"Chropowatość (ε)"},
  roughness_eps_hi: {en:"Roughness, upper bound", uk:"Шорсткість, верхня межа", de:"Rauheit, Obergrenze", nl:"Ruwheid, bovengrens", fr:"Rugosité, borne supérieure", es:"Rugosidad, límite superior", pl:"Chropowatość, górna granica"},
  roughness_eps_lo: {en:"Roughness, lower bound", uk:"Шорсткість, нижня межа", de:"Rauheit, Untergrenze", nl:"Ruwheid, ondergrens", fr:"Rugosité, borne inférieure", es:"Rugosidad, límite inferior", pl:"Chropowatość, dolna granica"},
  roughness_m: {en:"Pipe roughness", uk:"Шорсткість труби", de:"Rohrrauheit", nl:"Leidingruwheid", fr:"Rugosité de la conduite", es:"Rugosidad de la tubería", pl:"Chropowatość rurociągu"},
  rt60_eyring_s: {en:"Reverberation time (Eyring)", uk:"Час реверберації (Ейрінг)", de:"Nachhallzeit (Eyring)", nl:"Nagalmtijd (Eyring)", fr:"Temps de réverbération (Eyring)", es:"Tiempo de reverberación (Eyring)", pl:"Czas pogłosu (Eyring)"},
  rt60_sabine_s: {en:"Reverberation time (Sabine)", uk:"Час реверберації (Сабін)", de:"Nachhallzeit (Sabine)", nl:"Nagalmtijd (Sabine)", fr:"Temps de réverbération (Sabine)", es:"Tiempo de reverberación (Sabine)", pl:"Czas pogłosu (Sabine'a)"},
  running_cost: {en:"Running cost", uk:"Експлуатаційні витрати", de:"Betriebskosten", nl:"Exploitatiekosten", fr:"Coût d'exploitation", es:"Coste de explotación", pl:"Koszty eksploatacji"},
  s: [{u:["kJ/(kg.K)","kJ/(kg·K)","J/(kg.K)"], en:"Specific entropy", uk:"Питома ентропія", de:"Spezifische Entropie", nl:"Specifieke entropie", fr:"Entropie spécifique", es:"Entropía específica", pl:"Entropia właściwa"}],
  sandbox: {en:"Sandbox results", uk:"Результати пісочниці", de:"Sandbox-Ergebnisse", nl:"Sandboxresultaten", fr:"Résultats du bac à sable", es:"Resultados de la escena de pruebas", pl:"Wyniki piaskownicy"},
  sandbox_scene: {en:"Sandbox scene objects", uk:"Об'єкти сцени пісочниці", de:"Objekte der Sandbox-Szene", nl:"Objecten sandboxscène", fr:"Objets de la scène bac à sable", es:"Objetos de la escena de pruebas", pl:"Obiekty sceny piaskownicy"},
  scenario: {en:"Scenario", uk:"Сценарій", de:"Szenario", nl:"Scenario", fr:"Scénario", es:"Escenario", pl:"Scenariusz"},
  selected_element: {en:"Selected element", uk:"Обраний елемент", de:"Ausgewähltes Element", nl:"Geselecteerd element", fr:"Élément sélectionné", es:"Elemento seleccionado", pl:"Wybrany pierwiastek"},
  self_absorption_on: {en:"Self-absorption included", uk:"Враховано самопоглинання", de:"Selbstabsorption berücksichtigt", nl:"Zelfabsorptie meegenomen", fr:"Auto-absorption prise en compte", es:"Autoabsorción incluida", pl:"Uwzględniono samopochłanianie"},
  self_absorption_thickness: {en:"Gamma self-absorption thickness", uk:"Товщина самопоглинання гамма", de:"Schichtdicke der Gamma-Selbstabsorption", nl:"Dikte gamma-zelfabsorptie", fr:"Épaisseur d'auto-absorption gamma", es:"Espesor de autoabsorción gamma", pl:"Grubość samopochłaniania gamma"},
  sensible_heat_ratio: {en:"Sensible heat ratio", uk:"Коефіцієнт явного тепла", de:"Verhältnis fühlbare Wärme", nl:"Verhouding voelbare warmte", fr:"Rapport de chaleur sensible", es:"Relación de calor sensible", pl:"Współczynnik ciepła jawnego"},
  settling_time_2pct: {en:"Settling time (2%)", uk:"Час встановлення (2%)", de:"Einschwingzeit (2%)", nl:"Insteltijd (2%)", fr:"Temps d'établissement (2%)", es:"Tiempo de establecimiento (2%)", pl:"Czas regulacji (2%)"},
  settling_time_5pct: {en:"Settling time (5%)", uk:"Час встановлення (5%)", de:"Einschwingzeit (5%)", nl:"Insteltijd (5%)", fr:"Temps d'établissement (5%)", es:"Tiempo de establecimiento (5%)", pl:"Czas regulacji (5%)"},
  shear_stress_magnitude: {en:"Shear stress magnitude", uk:"Величина дотичного напруження", de:"Betrag der Schubspannung", nl:"Grootte van de schuifspanning", fr:"Amplitude de la contrainte de cisaillement", es:"Magnitud del esfuerzo cortante", pl:"Wartość naprężenia stycznego"},
  shock_angle: {en:"Shock angle (β)", uk:"Кут скачка ущільнення (β)", de:"Stoßwinkel (β)", nl:"Schokhoek (β)", fr:"Angle de choc (β)", es:"Ángulo de choque (β)", pl:"Kąt fali uderzeniowej (β)"},
  sigma_0: {en:"Reference cross-section (σ0)", uk:"Еталонний переріз (σ0)", de:"Referenz-Wirkungsquerschnitt (σ0)", nl:"Referentiedoorsnede (σ0)", fr:"Section efficace de référence (σ0)", es:"Sección eficaz de referencia (σ0)", pl:"Przekrój odniesienia (σ0)"},
  sigma_1: {en:"First principal stress (σ1)", uk:"Перше головне напруження (σ1)", de:"Erste Hauptspannung (σ1)", nl:"Eerste hoofdspanning (σ1)", fr:"Première contrainte principale (σ1)", es:"Primera tensión principal (σ1)", pl:"Pierwsze naprężenie główne (σ1)"},
  sigma_2: {en:"Second principal stress (σ2)", uk:"Друге головне напруження (σ2)", de:"Zweite Hauptspannung (σ2)", nl:"Tweede hoofdspanning (σ2)", fr:"Deuxième contrainte principale (σ2)", es:"Segunda tensión principal (σ2)", pl:"Drugie naprężenie główne (σ2)"},
  sigma_3: {en:"Third principal stress (σ3)", uk:"Третє головне напруження (σ3)", de:"Dritte Hauptspannung (σ3)", nl:"Derde hoofdspanning (σ3)", fr:"Troisième contrainte principale (σ3)", es:"Tercera tensión principal (σ3)", pl:"Trzecie naprężenie główne (σ3)"},
  sigma_peak_0K: {en:"Peak cross-section, 0 K", uk:"Пікове значення перерізу, 0 K", de:"Peak-Wirkungsquerschnitt, 0 K", nl:"Piekdoorsnede, 0 K", fr:"Section efficace au pic, 0 K", es:"Sección eficaz de pico, 0 K", pl:"Przekrój w maksimum, 0 K"},
  sigma_peak_T: {en:"Peak cross-section at T (σ)", uk:"Пікове значення перерізу при T (σ)", de:"Peak-Wirkungsquerschnitt bei T (σ)", nl:"Piekwerkzame doorsnede bij T (σ)", fr:"Section efficace au pic à T (σ)", es:"Sección eficaz de pico a T (σ)", pl:"Przekrój w maksimum przy T (σ)"},
  sigma_x: {en:"Normal stress σx", uk:"Нормальне напруження σx", de:"Normalspannung σx", nl:"Normaalspanning σx", fr:"Contrainte normale σx", es:"Tensión normal σx", pl:"Naprężenie normalne σx"},
  sigma_y: {en:"Normal stress σy", uk:"Нормальне напруження σy", de:"Normalspannung σy", nl:"Normaalspanning σy", fr:"Contrainte normale σy", es:"Tensión normal σy", pl:"Naprężenie normalne σy"},
  simplified_percentage: {en:"Simplified rule percentage", uk:"Відсоток за спрощеним правилом", de:"Prozentsatz der vereinfachten Regel", nl:"Percentage vereenvoudigde regel", fr:"Pourcentage de la règle simplifiée", es:"Porcentaje de la regla simplificada", pl:"Procent reguły uproszczonej"},
  sky_conditions: {en:"Sky conditions", uk:"Стан неба", de:"Himmelsbedingungen", nl:"Hemelcondities", fr:"Conditions du ciel", es:"Condiciones del cielo", pl:"Warunki nieba"},
  sky_diffuse_component: {en:"Sky-diffuse irradiance component", uk:"Розсіяна складова від неба", de:"Diffuser Himmelsanteil", nl:"Diffuse hemelcomponent", fr:"Composante diffuse du ciel", es:"Componente difusa del cielo", pl:"Składowa rozproszona nieba"},
  smoke_free_height: {en:"Smoke-free height", uk:"Незадимлювана висота", de:"Rauchfreie Höhe", nl:"Rookvrije hoogte", fr:"Hauteur libre de fumée", es:"Altura libre de humos", pl:"Wysokość wolna od dymu"},
  smoke_gas_temperature: {en:"Smoke gas temperature", uk:"Температура димових газів", de:"Rauchgastemperatur", nl:"Rookgastemperatuur", fr:"Température des fumées", es:"Temperatura de los humos", pl:"Temperatura gazów dymowych"},
  smoke_mass_flow: {en:"Smoke mass flow rate", uk:"Масова витрата диму", de:"Rauchgas-Massenstrom", nl:"Rookmassadebiet", fr:"Débit massique de fumée", es:"Caudal másico de humos", pl:"Strumień masy dymu"},
  smoke_volume_flow: {en:"Smoke volume flow rate", uk:"Об'ємна витрата диму", de:"Rauchgasvolumenstrom", nl:"Rookvolumedebiet", fr:"Débit volumique de fumée", es:"Caudal volumétrico de humos", pl:"Strumień objętości dymu"},
  sol_air_roof: {en:"Sol-air temperature, roof", uk:"Еквівалентна температура сонце-повітря, дах", de:"Sonnenlufttemperatur, Dach", nl:"Zon-luchttemperatuur, dak", fr:"Température sol-air, toiture", es:"Temperatura sol-aire, cubierta", pl:"Temperatura słoneczno-powietrzna, dach"},
  solar_absorptance: {en:"Solar absorptance (α)", uk:"Коефіцієнт поглинання сонячного випромінювання (α)", de:"Solarer Absorptionsgrad (α)", nl:"Zonneabsorptiecoëfficiënt (α)", fr:"Facteur d'absorption solaire (α)", es:"Coeficiente de absorción solar (α)", pl:"Współczynnik pochłaniania promieniowania słonecznego (α)"},
  solar_declination: {en:"Solar declination", uk:"Схилення сонця", de:"Sonnendeklination", nl:"Zonsdeclinatie", fr:"Déclinaison solaire", es:"Declinación solar", pl:"Deklinacja słoneczna"},
  solar_irradiance: {en:"Solar irradiance", uk:"Сонячне опромінення", de:"Solare Einstrahlung", nl:"Zonnestraling", fr:"Irradiance solaire", es:"Irradiancia solar", pl:"Napromieniowanie słoneczne"},
  solar_time: {en:"Solar time", uk:"Сонячний час", de:"Sonnenzeit", nl:"Zonnetijd", fr:"Heure solaire", es:"Hora solar", pl:"Czas słoneczny"},
  solver_iterations: {en:"Solver iterations", uk:"Ітерації розв'язувача", de:"Löser-Iterationen", nl:"Iteraties oplosser", fr:"Itérations du solveur", es:"Iteraciones del solver", pl:"Iteracje solvera"},
  solver_residual: {en:"Solver residual", uk:"Нев'язка розв'язувача", de:"Löser-Residuum", nl:"Residu oplosser", fr:"Résidu du solveur", es:"Residuo del solver", pl:"Residuum solvera"},
  sound_power: {en:"Sound power", uk:"Звукова потужність", de:"Schallleistung", nl:"Geluidsvermogen", fr:"Puissance acoustique", es:"Potencia sonora", pl:"Moc akustyczna"},
  sound_pressure: {en:"Sound pressure", uk:"Звуковий тиск", de:"Schalldruck", nl:"Geluidsdruk", fr:"Pression acoustique", es:"Presión sonora", pl:"Ciśnienie akustyczne"},
  source: {en:"Source", uk:"Джерело", de:"Quelle", nl:"Bron", fr:"Source", es:"Fuente", pl:"Źródło"},
  source_absolute_pressure_Pa: {en:"Source absolute pressure", uk:"Абсолютний тиск у точці джерела", de:"Absolutdruck am Quellpunkt", nl:"Absolute druk bij bron", fr:"Pression absolue au point de départ", es:"Presión absoluta en el origen", pl:"Ciśnienie bezwzględne w punkcie źródłowym"},
  source_current_A: {en:"Source current", uk:"Струм джерела", de:"Quellenstrom", nl:"Bronstroom", fr:"Courant de la source", es:"Corriente de la fuente", pl:"Prąd źródła"},
  source_elevation_m: {en:"Source elevation", uk:"Відмітка точки джерела", de:"Höhenlage Quellpunkt", nl:"Hoogteligging bron", fr:"Altitude du point de départ", es:"Cota del punto de origen", pl:"Rzędna punktu źródłowego"},
  source_height: {en:"Heat source height", uk:"Висота джерела тепла", de:"Höhe der Wärmequelle", nl:"Hoogte warmtebron", fr:"Hauteur de la source de chaleur", es:"Altura de la fuente de calor", pl:"Wysokość źródła ciepła"},
  source_id: {en:"Source model identifier", uk:"Ідентифікатор моделі джерела", de:"Kennung des Quellmodells", nl:"ID bronmodel", fr:"Identifiant du modèle de source", es:"Identificador del modelo de fuente", pl:"Identyfikator modelu źródła"},
  source_region: {en:"Source region", uk:"Область джерела", de:"Quellregion", nl:"Brongebied", fr:"Région source", es:"Región de la fuente", pl:"Obszar źródła"},
  specific_activity: {en:"Specific activity", uk:"Питома активність", de:"Spezifische Aktivität", nl:"Specifieke activiteit", fr:"Activité spécifique", es:"Actividad específica", pl:"Aktywność właściwa"},
  specific_energy: {en:"Specific energy", uk:"Питома енергія", de:"Spezifischer Energieaufwand", nl:"Specifieke energie", fr:"Énergie spécifique", es:"Energía específica", pl:"Energia jednostkowa"},
  specific_heat_load: {en:"Specific heat load", uk:"Питоме теплове навантаження", de:"Spezifische Heizlast", nl:"Specifieke warmtelast", fr:"Charge thermique spécifique", es:"Carga térmica específica", pl:"Jednostkowe obciążenie cieplne"},
  spectral_index: {en:"Neutron spectral index", uk:"Спектральний індекс", de:"Spektralindex", nl:"Spectrale index", fr:"Indice spectral", es:"Índice espectral", pl:"Indeks widmowy"},
  spectrum_map: {en:"Spectrum map", uk:"Карта спектра", de:"Spektrumkarte", nl:"Spectrumkaart", fr:"Carte spectrale", es:"Mapa espectral", pl:"Mapa widma"},
  speed_achieved: {en:"Achieved rod speed", uk:"Досягнута швидкість стрижня", de:"Erreichte Stabgeschwindigkeit", nl:"Behaalde staafsnelheid", fr:"Vitesse de barre atteinte", es:"Velocidad de barra alcanzada", pl:"Osiągnięta prędkość pręta"},
  speed_ordered: {en:"Commanded rod speed", uk:"Задана швидкість стрижня", de:"Vorgegebene Stabgeschwindigkeit", nl:"Opgelegde staafsnelheid", fr:"Vitesse de barre commandée", es:"Velocidad de barra ordenada", pl:"Zadana prędkość pręta"},
  speed_percent: {en:"Pump speed", uk:"Швидкість обертання насоса", de:"Pumpendrehzahl", nl:"Pomptoerental", fr:"Vitesse de la pompe", es:"Velocidad de la bomba", pl:"Prędkość obrotowa pompy"},
  stagnation_temperature: {en:"Stagnation temperature", uk:"Температура застою", de:"Stagnationstemperatur", nl:"Stagnatietemperatuur", fr:"Température de stagnation", es:"Temperatura de estancamiento", pl:"Temperatura stagnacji"},
  start_dry_air_flow: {en:"Start-state dry-air flow", uk:"Витрата сухого повітря початкового стану", de:"Trockenluftstrom des Ausgangszustands", nl:"Droge-luchtdebiet beginpunt", fr:"Débit d'air sec de l'état initial", es:"Caudal de aire seco del estado inicial", pl:"Strumień powietrza suchego stanu początkowego"},
  start_humidity_ratio: {en:"Start-state humidity ratio", uk:"Вологовміст початкового стану", de:"Wassergehalt des Ausgangszustands", nl:"Vochtverhouding beginpunt", fr:"Teneur en eau de l'état initial", es:"Contenido de humedad del estado inicial", pl:"Zawartość wilgoci stanu początkowego"},
  start_temperature: {en:"Start-state temperature", uk:"Температура початкового стану", de:"Temperatur des Ausgangszustands", nl:"Temperatuur beginpunt", fr:"Température de l'état initial", es:"Temperatura del estado inicial", pl:"Temperatura stanu początkowego"},
  starts_per_hour: {en:"Starts per hour", uk:"Кількість пусків на годину", de:"Schaltungen pro Stunde", nl:"Starts per uur", fr:"Démarrages par heure", es:"Arranques por hora", pl:"Liczba załączeń na godzinę"},
  steady: {en:"Steady state reached", uk:"Досягнуто усталеного режиму", de:"Stationärer Zustand erreicht", nl:"Stationaire toestand bereikt", fr:"Régime permanent atteint", es:"Régimen estacionario alcanzado", pl:"Osiągnięto stan ustalony"},
  steady_friction_head: {en:"Steady friction head loss", uk:"Втрата напору на тертя (стаціонарна)", de:"Stationärer Reibungsverlust", nl:"Stationair wrijvingsverlies", fr:"Perte de charge par frottement en régime établi", es:"Pérdida de carga por fricción en régimen estacionario", pl:"Ustalona strata na tarcie"},
  steady_state_error: {en:"Steady-state error", uk:"Усталена похибка", de:"Bleibende Regelabweichung", nl:"Statische fout", fr:"Erreur statique", es:"Error en régimen permanente", pl:"Uchyb ustalony"},
  step_tolerance_K: {en:"Step tolerance", uk:"Допуск кроку", de:"Schritttoleranz", nl:"Staptolerantie", fr:"Tolérance de pas", es:"Tolerancia de paso", pl:"Tolerancja kroku"},
  steps: {en:"Time steps computed", uk:"Кількість кроків за часом", de:"Anzahl Zeitschritte", nl:"Aantal tijdstappen", fr:"Nombre de pas de temps", es:"Número de pasos de tiempo", pl:"Liczba kroków czasowych"},
  stratification_fraction: {en:"Stratification fraction", uk:"Частка розшарування", de:"Schichtungsanteil", nl:"Stratificatiefractie", fr:"Fraction de stratification", es:"Fracción de estratificación", pl:"Udział stratyfikacji"},
  stratification_span: {en:"Stratification span", uk:"Діапазон розшарування", de:"Schichtungsspanne", nl:"Stratificatiespanne", fr:"Amplitude de stratification", es:"Amplitud de estratificación", pl:"Rozpiętość stratyfikacji"},
  stress3d_azimuth: {en:"Stress state azimuth", uk:"Азимут стану напружень", de:"Azimut des Spannungszustands", nl:"Azimut spanningstoestand", fr:"Azimut de l'état de contrainte", es:"Azimut del estado de tensión", pl:"Azymut stanu naprężenia"},
  stress3d_elevation: {en:"Stress state elevation angle", uk:"Кут підйому стану напружень", de:"Elevationswinkel des Spannungszustands", nl:"Elevatiehoek spanningstoestand", fr:"Angle d'élévation de l'état de contrainte", es:"Ángulo de elevación del estado de tensión", pl:"Kąt elewacji stanu naprężenia"},
  stress3d_xx: {en:"Normal stress, xx (σxx)", uk:"Нормальне напруження, xx (σxx)", de:"Normalspannung, xx (σxx)", nl:"Normaalspanning, xx (σxx)", fr:"Contrainte normale, xx (σxx)", es:"Tensión normal, xx (σxx)", pl:"Naprężenie normalne, xx (σxx)"},
  stress3d_xy: {en:"Shear stress, xy (τxy)", uk:"Дотичне напруження, xy (τxy)", de:"Schubspannung, xy (τxy)", nl:"Schuifspanning, xy (τxy)", fr:"Contrainte de cisaillement, xy (τxy)", es:"Tensión cortante, xy (τxy)", pl:"Naprężenie styczne, xy (τxy)"},
  stress3d_xz: {en:"Shear stress, xz (τxz)", uk:"Дотичне напруження, xz (τxz)", de:"Schubspannung, xz (τxz)", nl:"Schuifspanning, xz (τxz)", fr:"Contrainte de cisaillement, xz (τxz)", es:"Tensión cortante, xz (τxz)", pl:"Naprężenie styczne, xz (τxz)"},
  stress3d_yy: {en:"Normal stress, yy (σyy)", uk:"Нормальне напруження, yy (σyy)", de:"Normalspannung, yy (σyy)", nl:"Normaalspanning, yy (σyy)", fr:"Contrainte normale, yy (σyy)", es:"Tensión normal, yy (σyy)", pl:"Naprężenie normalne, yy (σyy)"},
  stress3d_yz: {en:"Shear stress, yz (τyz)", uk:"Дотичне напруження, yz (τyz)", de:"Schubspannung, yz (τyz)", nl:"Schuifspanning, yz (τyz)", fr:"Contrainte de cisaillement, yz (τyz)", es:"Tensión cortante, yz (τyz)", pl:"Naprężenie styczne, yz (τyz)"},
  stress3d_zz: {en:"Normal stress, zz (σzz)", uk:"Нормальне напруження, zz (σzz)", de:"Normalspannung, zz (σzz)", nl:"Normaalspanning, zz (σzz)", fr:"Contrainte normale, zz (σzz)", es:"Tensión normal, zz (σzz)", pl:"Naprężenie normalne, zz (σzz)"},
  stress_determinant: {en:"Stress tensor determinant (I3)", uk:"Визначник тензора напружень (I3)", de:"Determinante des Spannungstensors (I3)", nl:"Determinant van de spanningstensor (I3)", fr:"Déterminant du tenseur des contraintes (I3)", es:"Determinante del tensor de tensiones (I3)", pl:"Wyznacznik tensora naprężeń (I3)"},
  structural_materials_kg: {en:"Structural materials", uk:"Конструкційні матеріали", de:"Strukturmaterialien", nl:"Constructiematerialen", fr:"Matériaux de structure", es:"Materiales estructurales", pl:"Materiały konstrukcyjne"},
  structure_flux_factor: {en:"Structure-to-fuel flux ratio", uk:"Відношення потоку в конструкції до палива", de:"Verhältnis Strukturfluss zu Brennstofffluss", nl:"Fluxverhouding constructie/splijtstof", fr:"Rapport des flux structure/combustible", es:"Relación de flujo estructura/combustible", pl:"Stosunek strumienia w konstrukcji do paliwa"},
  subcooling: {en:"Subcooling", uk:"Переохолодження", de:"Unterkühlung", nl:"Onderkoeling", fr:"Sous-refroidissement", es:"Subenfriamiento", pl:"Dochłodzenie"},
  suction_superheat: {en:"Suction superheat", uk:"Перегрів на всмоктуванні", de:"Sauggasüberhitzung", nl:"Zuiggasoververhitting", fr:"Surchauffe à l'aspiration", es:"Recalentamiento en la aspiración", pl:"Przegrzanie na ssaniu"},
  suction_valve_open_percent: {en:"Suction valve opening", uk:"Відкриття всмоктувального клапана", de:"Öffnung Saugventil", nl:"Opening zuigklep", fr:"Ouverture vanne d'aspiration", es:"Apertura de válvula de aspiración", pl:"Otwarcie zaworu ssawnego"},
  sum_K: {en:"Sum of loss coefficients (ΣK)", uk:"Сума коефіцієнтів місцевого опору (ΣK)", de:"Summe der Verlustbeiwerte (ΣK)", nl:"Som verliescoëfficiënten (ΣK)", fr:"Somme des coefficients de perte (ΣK)", es:"Suma de coeficientes de pérdida (ΣK)", pl:"Suma współczynników strat (ΣK)"},
  sun_azimuth: {en:"Sun azimuth angle", uk:"Азимут сонця", de:"Sonnenazimut", nl:"Zonsazimut", fr:"Azimut solaire", es:"Azimut solar", pl:"Azymut słońca"},
  sun_elevation: {en:"Sun elevation angle", uk:"Кут висоти сонця", de:"Sonnenhöhenwinkel", nl:"Zonshoogte", fr:"Hauteur du soleil", es:"Elevación solar", pl:"Wysokość słońca"},
  sunrise: {en:"Sunrise", uk:"Схід сонця", de:"Sonnenaufgang", nl:"Zonsopkomst", fr:"Lever du soleil", es:"Salida del sol", pl:"Wschód słońca"},
  sunset: {en:"Sunset", uk:"Захід сонця", de:"Sonnenuntergang", nl:"Zonsondergang", fr:"Coucher du soleil", es:"Puesta del sol", pl:"Zachód słońca"},
  supply_air_gain: {en:"Supply air heat gain", uk:"Теплонадходження від припливного повітря", de:"Wärmeeintrag durch Zuluft", nl:"Warmte-inbreng via toevoerlucht", fr:"Apport de chaleur par l'air soufflé", es:"Aporte de calor del aire de impulsión", pl:"Zysk ciepła od powietrza nawiewanego"},
  supply_dry_air_density: {en:"Supply dry air density", uk:"Густина сухого припливного повітря", de:"Dichte der trockenen Zuluft", nl:"Dichtheid droge toevoerlucht", fr:"Masse volumique de l'air sec soufflé", es:"Densidad del aire seco de impulsión", pl:"Gęstość suchego powietrza nawiewanego"},
  supply_flow: {en:"Supply airflow", uk:"Витрата припливного повітря", de:"Zuluftvolumenstrom", nl:"Toevoerluchtdebiet", fr:"Débit d'air soufflé", es:"Caudal de aire de impulsión", pl:"Przepływ powietrza nawiewanego"},
  supply_humidity_ratio: {en:"Supply humidity ratio", uk:"Вологовміст припливного повітря", de:"Feuchtegehalt der Zuluft", nl:"Vochtverhouding toevoerlucht", fr:"Teneur en humidité de l'air soufflé", es:"Relación de humedad del aire de impulsión", pl:"Zawartość wilgoci powietrza nawiewanego"},
  supply_specific_heat: {en:"Supply air specific heat", uk:"Питома теплоємність припливного повітря", de:"Spezifische Wärmekapazität der Zuluft", nl:"Soortelijke warmte toevoerlucht", fr:"Chaleur massique de l'air soufflé", es:"Calor específico del aire de impulsión", pl:"Ciepło właściwe powietrza nawiewanego"},
  supply_temperature: {en:"Supply temperature", uk:"Температура подачі", de:"Vorlauftemperatur", nl:"Aanvoertemperatuur", fr:"Température de départ", es:"Temperatura de impulsión", pl:"Temperatura zasilania"},
  supply_units: {en:"Supply units", uk:"Кількість припливних установок", de:"Anzahl Zuluftgeräte", nl:"Aantal toevoerunits", fr:"Nombre d'unités de soufflage", es:"Número de unidades de impulsión", pl:"Liczba jednostek nawiewnych"},
  support_type: {en:"Support type", uk:"Тип опори", de:"Lagerungsart", nl:"Type oplegging", fr:"Type d'appui", es:"Tipo de apoyo", pl:"Typ podparcia"},
  surface_temperature: {en:"Surface temperature", uk:"Температура поверхні", de:"Oberflächentemperatur", nl:"Oppervlaktetemperatuur", fr:"Température de surface", es:"Temperatura superficial", pl:"Temperatura powierzchni"},
  surface_temperature_mode: {en:"Surface temperature model", uk:"Модель температури поверхні", de:"Modell der Oberflächentemperatur", nl:"Model oppervlaktetemperatuur", fr:"Modèle de température de surface", es:"Modelo de temperatura superficial", pl:"Model temperatury powierzchni"},
  surge_vessel: {en:"Surge vessel", uk:"Гідропневматичний бак (демпфер)", de:"Windkessel", nl:"Vereffeningsvat", fr:"Réservoir anti-bélier", es:"Depósito antiariete", pl:"Zbiornik wyrównawczy (tłumiący)"},
  system_volume: {en:"System water volume", uk:"Об'єм води системи", de:"Anlagenwasservolumen", nl:"Systeemwatervolume", fr:"Volume d'eau de l'installation", es:"Volumen de agua del sistema", pl:"Objętość wody instalacji"},
  tEnd: {en:"End time", uk:"Кінцевий час", de:"Endzeit", nl:"Eindtijd", fr:"Temps final", es:"Tiempo final", pl:"Czas końcowy"},
  t_display_unit: {en:"Temperature display unit", uk:"Одиниця відображення температури", de:"Anzeigeeinheit für Temperatur", nl:"Weergave-eenheid temperatuur", fr:"Unité d'affichage de la température", es:"Unidad de visualización de temperatura", pl:"Jednostka wyświetlania temperatury"},
  t_end_s: {en:"End time", uk:"Кінцевий час", de:"Endzeit", nl:"Eindtijd", fr:"Temps final", es:"Tiempo final", pl:"Czas końcowy"},
  t_model: {en:"Model time", uk:"Модельний час", de:"Modellzeit", nl:"Modeltijd", fr:"Temps modèle", es:"Tiempo del modelo", pl:"Czas modelowy"},
  targetP: {en:"Target pressure", uk:"Цільовий тиск", de:"Zieldruck", nl:"Streefdruk", fr:"Pression cible", es:"Presión objetivo", pl:"Ciśnienie docelowe"},
  target_pressure_step: {en:"Target pressure step", uk:"Цільовий крок тиску", de:"Ziel-Druckschritt", nl:"Streefstap drukverschil", fr:"Pas de pression cible", es:"Incremento de presión objetivo", pl:"Docelowy krok ciśnienia"},
  target_temperature: {en:"Target temperature", uk:"Цільова температура", de:"Solltemperatur", nl:"Streeftemperatuur", fr:"Température cible", es:"Temperatura objetivo", pl:"Temperatura docelowa"},
  tau_max_in_plane: {en:"Maximum in-plane shear stress", uk:"Максимальне дотичне напруження в площині", de:"Maximale Schubspannung in der Ebene", nl:"Maximale schuifspanning in het vlak", fr:"Contrainte de cisaillement maximale dans le plan", es:"Tensión cortante máxima en el plano", pl:"Maksymalne naprężenie styczne w płaszczyźnie"},
  tau_xy: {en:"Shear stress (τxy)", uk:"Дотичне напруження (τxy)", de:"Schubspannung (τxy)", nl:"Schuifspanning (τxy)", fr:"Contrainte de cisaillement (τxy)", es:"Tensión cortante (τxy)", pl:"Naprężenie styczne (τxy)"},
  td_attainable: {en:"Attainable supply dew point", uk:"Досяжна точка роси припливу", de:"Erreichbarer Zulufttaupunkt", nl:"Haalbaar toevoerdauwpunt", fr:"Point de rosée de soufflage atteignable", es:"Punto de rocío de impulsión alcanzable", pl:"Osiągalny punkt rosy nawiewu"},
  td_supply: {en:"Supply dew point (Td)", uk:"Точка роси припливного повітря (Td)", de:"Taupunkt der Zuluft (Td)", nl:"Dauwpunt toevoerlucht (Td)", fr:"Point de rosée soufflé (Td)", es:"Punto de rocío de impulsión (Td)", pl:"Punkt rosy nawiewu (Td)"},
  temperature: {en:"Temperature", uk:"Температура", de:"Temperatur", nl:"Temperatuur", fr:"Température", es:"Temperatura", pl:"Temperatura"},
  temperature_at_probe: {en:"Temperature at probe", uk:"Температура в точці вимірювання", de:"Temperatur am Messpunkt", nl:"Temperatuur bij meetpunt", fr:"Température au point de mesure", es:"Temperatura en el punto de sonda", pl:"Temperatura w punkcie pomiaru"},
  temperature_bottom: {en:"Temperature, bottom", uk:"Температура, внизу", de:"Temperatur, unten", nl:"Temperatuur, onderin", fr:"Température, en bas", es:"Temperatura, parte inferior", pl:"Temperatura, dół"},
  temperature_rise: {en:"Temperature rise", uk:"Приріст температури", de:"Temperaturanstieg", nl:"Temperatuurstijging", fr:"Élévation de température", es:"Aumento de temperatura", pl:"Wzrost temperatury"},
  temperature_spread: {en:"Temperature spread", uk:"Перепад температур", de:"Temperaturspreizung", nl:"Temperatuurspreiding", fr:"Écart de température", es:"Salto térmico", pl:"Rozpiętość temperatur"},
  temperature_top: {en:"Temperature, top", uk:"Температура, вгорі", de:"Temperatur, oben", nl:"Temperatuur, bovenin", fr:"Température, en haut", es:"Temperatura, parte superior", pl:"Temperatura, góra"},
  tensile_strength: {en:"Tensile strength", uk:"Міцність на розтяг", de:"Zugfestigkeit", nl:"Treksterkte", fr:"Résistance à la traction", es:"Resistencia a la tracción", pl:"Wytrzymałość na rozciąganie"},
  termination: {en:"Termination reason", uk:"Причина завершення", de:"Abbruchgrund", nl:"Reden van beëindiging", fr:"Motif d'arrêt", es:"Motivo de finalización", pl:"Przyczyna zakończenia"},
  thermal_emittance: {en:"Thermal emittance (ε)", uk:"Ступінь чорноти (ε)", de:"Emissionsgrad (ε)", nl:"Thermische emissiecoëfficiënt (ε)", fr:"Émissivité thermique (ε)", es:"Emisividad térmica (ε)", pl:"Emisyjność cieplna (ε)"},
  thermal_equivalent_current_A: {en:"Thermal equivalent current", uk:"Термічно еквівалентний струм", de:"Thermisch gleichwertiger Kurzschlussstrom", nl:"Thermisch gelijkwaardige stroom", fr:"Courant thermique équivalent", es:"Corriente térmica equivalente", pl:"Prąd cieplny zastępczy"},
  thermal_fraction_below_cutoff: {en:"Thermal fraction below cutoff", uk:"Частка теплових нейтронів нижче межі", de:"Thermischer Anteil unterhalb der Grenzenergie", nl:"Thermisch aandeel onder afkapenergie", fr:"Fraction thermique sous le seuil", es:"Fracción térmica por debajo del corte", pl:"Udział termiczny poniżej progu"},
  thermal_insulation: {en:"Thermal insulation", uk:"Термоізоляція", de:"Wärmedämmung", nl:"Thermische isolatie", fr:"Isolation thermique", es:"Aislamiento térmico", pl:"Izolacja termiczna"},
  thermo_model: {en:"Thermodynamic model", uk:"Термодинамічна модель", de:"Thermodynamisches Modell", nl:"Thermodynamisch model", fr:"Modèle thermodynamique", es:"Modelo termodinámico", pl:"Model termodynamiczny"},
  theta_dew: {en:"Dew point temperature", uk:"Температура точки роси", de:"Taupunkttemperatur", nl:"Dauwpuntstemperatuur", fr:"Température du point de rosée", es:"Temperatura del punto de rocío", pl:"Temperatura punktu rosy"},
  theta_e: {en:"External temperature (θe)", uk:"Зовнішня температура (θe)", de:"Außentemperatur (θe)", nl:"Buitentemperatuur (θe)", fr:"Température extérieure (θe)", es:"Temperatura exterior (θe)", pl:"Temperatura zewnętrzna (θe)"},
  theta_i: {en:"Internal temperature (θi)", uk:"Внутрішня температура (θi)", de:"Innentemperatur (θi)", nl:"Binnentemperatuur (θi)", fr:"Température intérieure (θi)", es:"Temperatura interior (θi)", pl:"Temperatura wewnętrzna (θi)"},
  theta_max: {en:"Maximum turn angle (θmax)", uk:"Максимальний кут повороту (θmax)", de:"Maximaler Umlenkwinkel (θmax)", nl:"Maximale afbuighoek (θmax)", fr:"Angle de déviation maximal (θmax)", es:"Ángulo de desviación máximo (θmax)", pl:"Maksymalny kąt odchylenia (θmax)"},
  theta_max_shear: {en:"Angle of maximum shear (θ)", uk:"Кут максимального зсуву (θ)", de:"Winkel der maximalen Schubspannung (θ)", nl:"Hoek van maximale schuifspanning (θ)", fr:"Angle de cisaillement maximal (θ)", es:"Ángulo de cortante máximo (θ)", pl:"Kąt maksymalnego naprężenia stycznego (θ)"},
  theta_principal: {en:"Principal angle", uk:"Головний кут", de:"Hauptrichtungswinkel", nl:"Hoofdrichtingshoek", fr:"Angle principal", es:"Ángulo principal", pl:"Kąt główny"},
  theta_se: {en:"External surface temperature (θse)", uk:"Температура зовнішньої поверхні (θse)", de:"Oberflächentemperatur außen (θse)", nl:"Buitenoppervlaktetemperatuur (θse)", fr:"Température de surface extérieure (θse)", es:"Temperatura superficial exterior (θse)", pl:"Temperatura powierzchni zewnętrznej (θse)"},
  theta_si: {en:"Internal surface temperature (θsi)", uk:"Температура внутрішньої поверхні (θsi)", de:"Oberflächentemperatur innen (θsi)", nl:"Binnenoppervlaktetemperatuur (θsi)", fr:"Température de surface intérieure (θsi)", es:"Temperatura superficial interior (θsi)", pl:"Temperatura powierzchni wewnętrznej (θsi)"},
  theta_si_design: {en:"Design internal surface temperature", uk:"Розрахункова температура внутрішньої поверхні", de:"Bemessungs-Oberflächentemperatur innen", nl:"Ontwerp binnenoppervlaktetemperatuur", fr:"Température de surface intérieure de dimensionnement", es:"Temperatura superficial interior de diseño", pl:"Projektowa temperatura powierzchni wewnętrznej"},
  time: {en:"Time", uk:"Час", de:"Zeit", nl:"Tijd", fr:"Temps", es:"Tiempo", pl:"Czas"},
  time_shift: {en:"Time shift (thermal lag)", uk:"Часовий зсув (теплова інерція)", de:"Zeitverschiebung (Wärmeträgheit)", nl:"Tijdsverschuiving (thermische vertraging)", fr:"Déphasage thermique", es:"Desfase térmico", pl:"Przesunięcie fazowe (bezwładność cieplna)"},
  time_step: {en:"Time step", uk:"Крок за часом", de:"Zeitschritt", nl:"Tijdstap", fr:"Pas de temps", es:"Paso de tiempo", pl:"Krok czasowy"},
  time_to_target: {en:"Time to target pressure", uk:"Час до цільового тиску", de:"Zeit bis zum Zieldruck", nl:"Tijd tot streefdruk", fr:"Temps jusqu'à la pression cible", es:"Tiempo hasta la presión objetivo", pl:"Czas do ciśnienia docelowego"},
  time_zone: {en:"Time zone", uk:"Часовий пояс", de:"Zeitzone", nl:"Tijdzone", fr:"Fuseau horaire", es:"Zona horaria", pl:"Strefa czasowa"},
  total_activity: {en:"Total activity", uk:"Сумарна активність", de:"Gesamtaktivität", nl:"Totale activiteit", fr:"Activité totale", es:"Actividad total", pl:"Aktywność całkowita"},
  total_extract: {en:"Total extract airflow", uk:"Сумарна витрата витяжного повітря", de:"Gesamt-Abluftvolumenstrom", nl:"Totaal afvoerdebiet", fr:"Débit d'extraction total", es:"Caudal de extracción total", pl:"Całkowity przepływ wywiewany"},
  total_extraction: {en:"Total steam extraction", uk:"Сумарний відбір пари", de:"Gesamtdampfentnahme", nl:"Totale stoomaftap", fr:"Extraction totale de vapeur", es:"Extracción total de vapor", pl:"Całkowity pobór pary"},
  total_heat_source: {en:"Total heat source power", uk:"Сумарна потужність джерела тепла", de:"Gesamtleistung der Wärmequelle", nl:"Totaal vermogen warmtebron", fr:"Puissance totale de la source de chaleur", es:"Potencia total de la fuente de calor", pl:"Całkowita moc źródła ciepła"},
  total_load: {en:"Total load", uk:"Сумарне навантаження", de:"Gesamtlast", nl:"Totale belasting", fr:"Charge totale", es:"Carga total", pl:"Obciążenie całkowite"},
  total_mass: {en:"Total assembly mass", uk:"Загальна маса збірки", de:"Gesamtmasse des Brennelements", nl:"Totale massa element", fr:"Masse totale de l'assemblage", es:"Masa total del elemento", pl:"Całkowita masa zestawu"},
  total_pipe_length_m: {en:"Total pipe length", uk:"Загальна довжина труби", de:"Gesamtrohrlänge", nl:"Totale leidinglengte", fr:"Longueur totale de la conduite", es:"Longitud total de la tubería", pl:"Całkowita długość rurociągu"},
  total_supply: {en:"Total supply airflow", uk:"Сумарна витрата припливного повітря", de:"Gesamt-Zuluftvolumenstrom", nl:"Totaal toevoerdebiet", fr:"Débit de soufflage total", es:"Caudal de impulsión total", pl:"Całkowity przepływ nawiewany"},
  total_thickness: {en:"Total thickness", uk:"Загальна товщина", de:"Gesamtdicke", nl:"Totale dikte", fr:"Épaisseur totale", es:"Espesor total", pl:"Grubość całkowita"},
  transformer_loading_pct: {en:"Transformer loading", uk:"Завантаження трансформатора", de:"Transformatorauslastung", nl:"Transformatorbelasting", fr:"Charge du transformateur", es:"Carga del transformador", pl:"Obciążenie transformatora"},
  transformer_rating: {en:"Transformer rating", uk:"Номінальна потужність трансформатора", de:"Transformator-Bemessungsleistung", nl:"Nominaal transformatorvermogen", fr:"Puissance nominale du transformateur", es:"Potencia nominal del transformador", pl:"Moc znamionowa transformatora"},
  tresca: {en:"Tresca stress", uk:"Напруження за критерієм Треска", de:"Tresca-Spannung", nl:"Tresca-spanning", fr:"Contrainte de Tresca", es:"Tensión de Tresca", pl:"Naprężenie Treski"},
  turbine_isentropic_efficiency: {en:"Turbine isentropic efficiency", uk:"Ізентропний ККД турбіни", de:"Isentroper Turbinenwirkungsgrad", nl:"Isentropisch turbinerendement", fr:"Rendement isentropique de la turbine", es:"Rendimiento isentrópico de la turbina", pl:"Sprawność izentropowa turbiny"},
  turbine_power: {en:"Turbine power", uk:"Потужність турбіни", de:"Turbinenleistung", nl:"Turbinevermogen", fr:"Puissance de la turbine", es:"Potencia de la turbina", pl:"Moc turbiny"},
  turn_angle: {en:"Flow turn angle (θ)", uk:"Кут повороту потоку (θ)", de:"Strömungsumlenkwinkel (θ)", nl:"Stromingsafbuighoek (θ)", fr:"Angle de déviation de l'écoulement (θ)", es:"Ángulo de desviación del flujo (θ)", pl:"Kąt odchylenia strugi (θ)"},
  twin: {en:"Twin-paradox scenario", uk:"Сценарій парадоксу близнюків", de:"Zwillingsparadoxon-Szenario", nl:"Tweelingparadoxscenario", fr:"Scénario du paradoxe des jumeaux", es:"Escenario de la paradoja de los gemelos", pl:"Scenariusz paradoksu bliźniąt"},
  tz_offset: {en:"Time zone offset", uk:"Зсув часового поясу", de:"Zeitzonenversatz", nl:"Tijdzoneverschil", fr:"Décalage horaire", es:"Desfase horario", pl:"Przesunięcie strefy czasowej"},
  v: [{u:["m3/kg"], en:"Specific volume", uk:"Питомий об'єм", de:"Spezifisches Volumen", nl:"Specifiek volume", fr:"Volume massique", es:"Volumen específico", pl:"Objętość właściwa"}, {u:["m/s"], en:"Velocity", uk:"Швидкість", de:"Geschwindigkeit", nl:"Snelheid", fr:"Vitesse", es:"Velocidad", pl:"Prędkość"}],
  v_cold: {en:"Cold-side velocity", uk:"Швидкість, холодна сторона", de:"Geschwindigkeit Kaltseite", nl:"Snelheid koude zijde", fr:"Vitesse côté froid", es:"Velocidad lado frío", pl:"Prędkość, strona zimna"},
  v_hot: {en:"Hot-side velocity", uk:"Швидкість, гаряча сторона", de:"Geschwindigkeit Heißseite", nl:"Snelheid warme zijde", fr:"Vitesse côté chaud", es:"Velocidad lado caliente", pl:"Prędkość, strona gorąca"},
  value_1: {en:"Value of first property", uk:"Значення першої властивості", de:"Wert der ersten Zustandsgröße", nl:"Waarde eerste eigenschap", fr:"Valeur de la première propriété", es:"Valor de la primera propiedad", pl:"Wartość pierwszej właściwości"},
  value_2: {en:"Value of second property", uk:"Значення другої властивості", de:"Wert der zweiten Zustandsgröße", nl:"Waarde tweede eigenschap", fr:"Valeur de la seconde propriété", es:"Valor de la segunda propiedad", pl:"Wartość drugiej właściwości"},
  vapour_pressure: {en:"Vapour pressure", uk:"Тиск насиченої пари", de:"Dampfdruck", nl:"Dampdruk", fr:"Pression de vapeur", es:"Presión de vapor", pl:"Ciśnienie pary"},
  velocity: {en:"Velocity", uk:"Швидкість", de:"Geschwindigkeit", nl:"Snelheid", fr:"Vitesse", es:"Velocidad", pl:"Prędkość"},
  velocity_addition: {en:"Velocity addition", uk:"Додавання швидкостей", de:"Geschwindigkeitsaddition", nl:"Snelheidsoptelling", fr:"Addition des vitesses", es:"Adición de velocidades", pl:"Dodawanie prędkości"},
  vertical_gradient: {en:"Vertical temperature gradient", uk:"Вертикальний градієнт температури", de:"Vertikaler Temperaturgradient", nl:"Verticale temperatuurgradiënt", fr:"Gradient vertical de température", es:"Gradiente vertical de temperatura", pl:"Pionowy gradient temperatury"},
  vessel_two_phase_used: {en:"Two-phase vessel model used", uk:"Використано двофазну модель посудини", de:"Zweiphasen-Behältermodell verwendet", nl:"Tweefasenvatmodel gebruikt", fr:"Modèle de cuve diphasique utilisé", es:"Modelo de recipiente bifásico usado", pl:"Zastosowano dwufazowy model zbiornika"},
  viscosity_mu: {en:"Dynamic viscosity (μ)", uk:"Динамічна в'язкість (μ)", de:"Dynamische Viskosität (μ)", nl:"Dynamische viscositeit (μ)", fr:"Viscosité dynamique (μ)", es:"Viscosidad dinámica (μ)", pl:"Lepkość dynamiczna (μ)"},
  voidFraction: {en:"Void fraction", uk:"Об'ємна частка пари (void)", de:"Dampfvolumenanteil", nl:"Voidfractie", fr:"Taux de vide", es:"Fracción de vacío", pl:"Udział pustek parowych"},
  voltage_drop_pct: {en:"Voltage drop", uk:"Падіння напруги", de:"Spannungsfall", nl:"Spanningsval", fr:"Chute de tension", es:"Caída de tensión", pl:"Spadek napięcia"},
  volume: {en:"Volume", uk:"Об'єм", de:"Volumen", nl:"Volume", fr:"Volume", es:"Volumen", pl:"Objętość"},
  volumetric_flow: {en:"Volumetric flow rate", uk:"Об'ємна витрата", de:"Volumenstrom", nl:"Volumedebiet", fr:"Débit volumique", es:"Caudal volumétrico", pl:"Strumień objętości"},
  von_mises: {en:"Von Mises stress", uk:"Напруження за фон Мізесом", de:"Von-Mises-Spannung", nl:"Von Mises-spanning", fr:"Contrainte de von Mises", es:"Tensión de von Mises", pl:"Naprężenie zredukowane (von Misesa)"},
  voxel_h: {en:"Voxel size", uk:"Розмір вокселя", de:"Voxelgröße", nl:"Voxelgrootte", fr:"Taille du voxel", es:"Tamaño de vóxel", pl:"Rozmiar woksela"},
  w_mean: {en:"Mean humidity ratio", uk:"Середній вологовміст", de:"Mittlerer Wassergehalt", nl:"Gemiddelde vochtverhouding", fr:"Teneur en eau moyenne", es:"Contenido de humedad medio", pl:"Średnia zawartość wilgoci"},
  wallCp: {en:"Wall specific heat capacity", uk:"Питома теплоємність стінки", de:"Spezifische Wärmekapazität der Wand", nl:"Specifieke warmtecapaciteit wand", fr:"Capacité thermique massique de la paroi", es:"Capacidad calorífica específica de la pared", pl:"Ciepło właściwe ścianki"},
  wallMass: {en:"Wall mass", uk:"Маса стінки", de:"Wandmasse", nl:"Wandmassa", fr:"Masse de la paroi", es:"Masa de la pared", pl:"Masa ścianki"},
  wall_conductivity: {en:"Wall thermal conductivity", uk:"Теплопровідність стінки", de:"Wärmeleitfähigkeit der Wand", nl:"Warmtegeleidbaarheid wand", fr:"Conductivité thermique de la paroi", es:"Conductividad térmica de la pared", pl:"Przewodność cieplna ścianki"},
  wall_gain: {en:"Wall heat gain", uk:"Теплонадходження через стіни", de:"Wärmegewinn durch die Wand", nl:"Warmtewinst via wand", fr:"Gain thermique par les murs", es:"Ganancia térmica por muros", pl:"Zysk ciepła przez ściany"},
  wall_material: {en:"Wall material", uk:"Матеріал стіни", de:"Wandmaterial", nl:"Wandmateriaal", fr:"Matériau de mur", es:"Material del muro", pl:"Materiał ściany"},
  wall_thickness: {en:"Wall thickness", uk:"Товщина стінки", de:"Wanddicke", nl:"Wanddikte", fr:"Épaisseur de paroi", es:"Espesor de pared", pl:"Grubość ścianki"},
  wall_u_value: {en:"Wall U-value", uk:"Коефіцієнт теплопередачі стіни", de:"U-Wert Wand", nl:"U-waarde wand", fr:"Coefficient U du mur", es:"Valor U del muro", pl:"Współczynnik U ściany"},
  water_flow_cooling: {en:"Water flow (cooling)", uk:"Витрата води (охолодження)", de:"Wasservolumenstrom (Kühlen)", nl:"Waterdebiet (koelen)", fr:"Débit d'eau (refroidissement)", es:"Caudal de agua (refrigeración)", pl:"Przepływ wody (chłodzenie)"},
  water_flow_heating: {en:"Water flow (heating)", uk:"Витрата води (опалення)", de:"Wasservolumenstrom (Heizen)", nl:"Waterdebiet (verwarmen)", fr:"Débit d'eau (chauffage)", es:"Caudal de agua (calefacción)", pl:"Przepływ wody (ogrzewanie)"},
  water_removed: {en:"Water removed", uk:"Видалена волога", de:"Entfeuchtungsmenge", nl:"Verwijderd vocht", fr:"Eau extraite", es:"Agua extraída", pl:"Usunięta wilgoć"},
  water_tariff: {en:"Water tariff", uk:"Тариф на воду", de:"Wasserpreis", nl:"Watertarief", fr:"Tarif de l'eau", es:"Tarifa del agua", pl:"Taryfa wody"},
  water_temperature_C: {en:"Water temperature", uk:"Температура води", de:"Wassertemperatur", nl:"Watertemperatuur", fr:"Température de l'eau", es:"Temperatura del agua", pl:"Temperatura wody"},
  water_use: {en:"Water use", uk:"Споживання води", de:"Wasserverbrauch", nl:"Waterverbruik", fr:"Consommation d'eau", es:"Consumo de agua", pl:"Zużycie wody"},
  weight_windows: {en:"Weight windows", uk:"Вагові вікна", de:"Weight Windows", nl:"Weight windows", fr:"Fenêtres de poids", es:"Ventanas de peso", pl:"Okna wagowe"},
  wet_operation_fraction: {en:"Wet-operation fraction", uk:"Частка вологого режиму роботи", de:"Anteil Nassbetrieb", nl:"Aandeel natbedrijf", fr:"Fraction de fonctionnement humide", es:"Fracción de funcionamiento húmedo", pl:"Udział pracy na mokro"},
  width: {en:"Width", uk:"Ширина", de:"Breite", nl:"Breedte", fr:"Largeur", es:"Anchura", pl:"Szerokość"},
  wind_speed: {en:"Wind speed", uk:"Швидкість вітру", de:"Windgeschwindigkeit", nl:"Windsnelheid", fr:"Vitesse du vent", es:"Velocidad del viento", pl:"Prędkość wiatru"},
  worker_threads: {en:"Worker threads", uk:"Робочих потоків", de:"Worker-Threads", nl:"Workerthreads", fr:"Threads de calcul", es:"Hilos de cálculo", pl:"Wątki robocze"},
  working_height: {en:"Working height", uk:"Робоча висота", de:"Arbeitshöhe", nl:"Werkhoogte", fr:"Hauteur de travail", es:"Altura de trabajo", pl:"Wysokość robocza"},
  world_xmax: {en:"World box, x max", uk:"Межа світу, x max", de:"Weltbox, x max", nl:"Wereldvak, x max", fr:"Domaine, x max", es:"Dominio, x máx", pl:"Obszar obliczeniowy, x max"},
  world_xmin: {en:"World box, x min", uk:"Межа світу, x min", de:"Weltbox, x min", nl:"Wereldvak, x min", fr:"Domaine, x min", es:"Dominio, x mín", pl:"Obszar obliczeniowy, x min"},
  world_ymax: {en:"World box, y max", uk:"Межа світу, y max", de:"Weltbox, y max", nl:"Wereldvak, y max", fr:"Domaine, y max", es:"Dominio, y máx", pl:"Obszar obliczeniowy, y max"},
  world_ymin: {en:"World box, y min", uk:"Межа світу, y min", de:"Weltbox, y min", nl:"Wereldvak, y min", fr:"Domaine, y min", es:"Dominio, y mín", pl:"Obszar obliczeniowy, y min"},
  worst_room_pressure: {en:"Worst-case room pressure", uk:"Найгірший тиск у приміщенні", de:"Ungünstigster Raumdruck", nl:"Ongunstigste ruimtedruk", fr:"Pression de local la plus défavorable", es:"Presión de local más desfavorable", pl:"Najgorsze ciśnienie w pomieszczeniu"},
  worst_zone_residual: {en:"Worst zone residual", uk:"Найбільша нев'язка по зоні", de:"Größtes Zonenresiduum", nl:"Grootste zoneresidu", fr:"Résidu de zone maximal", es:"Mayor residuo de zona", pl:"Największe residuum strefy"},
  x: [{u:["-","kg/kg"], en:"Vapour quality (x)", uk:"Сухість пари (x)", de:"Dampfgehalt (x)", nl:"Dampkwaliteit (x)", fr:"Titre vapeur (x)", es:"Título de vapor (x)", pl:"Stopień suchości pary (x)"}, {u:"at/cm3", en:"Xenon-135 concentration", uk:"Концентрація ксенону-135", de:"Xenon-135-Konzentration", nl:"Xenon-135-concentratie", fr:"Concentration en xénon 135", es:"Concentración de xenón-135", pl:"Stężenie ksenonu-135"}],
  x_choke: {en:"Distance to choking", uk:"Відстань до запирання потоку", de:"Abstand bis zur Verblockung", nl:"Afstand tot verstopping", fr:"Distance au blocage sonique", es:"Distancia al bloqueo sónico", pl:"Odległość do zadławienia"},
  x_room: {en:"Room humidity ratio (X)", uk:"Вологовміст приміщення (X)", de:"Wassergehalt Raumluft (X)", nl:"Vochtverhouding ruimte (X)", fr:"Teneur en eau du local (X)", es:"Contenido de humedad del local (X)", pl:"Zawartość wilgoci w pomieszczeniu (X)"},
  x_supply: {en:"Supply humidity ratio (X)", uk:"Вологовміст припливного повітря (X)", de:"Wassergehalt Zuluft (X)", nl:"Vochtverhouding toevoerlucht (X)", fr:"Teneur en eau soufflée (X)", es:"Contenido de humedad de impulsión (X)", pl:"Zawartość wilgoci nawiewu (X)"},
  xenon_equilibrium: {en:"Equilibrium xenon", uk:"Рівноважний ксенон", de:"Xenon-Gleichgewicht", nl:"Xenon-evenwicht", fr:"Xénon à l'équilibre", es:"Xenón de equilibrio", pl:"Równowagowy ksenon"},
  year: {en:"Year", uk:"Рік", de:"Jahr", nl:"Jaar", fr:"Année", es:"Año", pl:"Rok"},
  yield_strength: {en:"Yield strength", uk:"Границя текучості", de:"Streckgrenze", nl:"Vloeigrens", fr:"Limite d'élasticité", es:"Límite elástico", pl:"Granica plastyczności"}
};
/* A record key is a machine identifier, and humanising it -- underscores out,
   first letter up -- produces an English phrase whatever language the document
   is in. A Dutch sheet therefore carried Dutch section headings over rows
   reading "Heat total" and "Voxel h". QTYNAME above is the vocabulary of the
   keys this site actually uses, in the seven languages it supports; the index
   is case- and separator-insensitive so t_mean, T_mean and tMean all land on
   the same entry. A key that is not in the vocabulary still falls through to
   the English humanisation, which is what it did before. */
const QTYIDX=(()=>{
 const ix={};
 try{for(const k of Object.keys(QTYNAME))ix[qnorm(k)]=QTYNAME[k]}catch(e){}
 return ix;
})();
function qnorm(k){return String(k==null?"":k).toLowerCase().replace(/[^a-z0-9]/g,"")}
/* Record keys are machine identifiers. The old generic report exposed them
   verbatim (selected_phase_conductor_mm2), which made an otherwise valid sheet
   look like a debug dump. Keep the record contract unchanged and humanise only
   the printed label. Tool-supplied renderers still own their labels entirely. */
/* Units as written in a record: m2, W/(m2.K), J/kg. Compared without their
   punctuation so m2.K/W and m2\u00b7K/W are one unit. */
function qunit(u){
 const t=String(u==null?"":u).trim();
 /* A record that writes "-" has declared the quantity dimensionless; one that
    writes nothing has declared no unit at all. Both strip to the empty string,
    and they are not the same signal: gasdynamics gives gamma the unit "-" and
    means the isentropic exponent, relativity gives it no unit and means the
    Lorentz factor. Keep the dash. */
 if(t==="-")return "-";
 return t.replace(/[\u00b2]/g,"2").replace(/[\u00b3]/g,"3").toLowerCase().replace(/[^a-z0-9]/g,"");
}
/* A one-letter key is not one quantity. "h" is specific enthalpy in a steam
   table, a surface heat transfer coefficient in a wall build-up and a height in
   a ventilation model; "U" is a U-value at W/(m2.K) and specific internal
   energy at kJ/kg -- which is what a steam table printed as "U-waarde". Such an
   entry is written as a list of variants, each holding for the units named in
   it. With no variant for the unit at hand the vocabulary claims no name and
   the identifier is humanised instead: an untranslated label is a gap, a wrong
   one is a defect. */
function qtyVariant(hit,u){
 if(!Array.isArray(hit))return hit;
 const want=qunit(u);
 for(const v of hit){
  const us=Array.isArray(v.u)?v.u:[v.u];
  if(us.some(x=>x!=null&&qunit(x)===want))return v;
 }
 return null;
}
function reportKey(k,u,l){
 const hit=qtyVariant(QTYIDX[qnorm(k)],u);
 if(hit)return pick(hit,l||currentLang());
 let s=String(k==null?"":k).replace(/[._-]+/g," ")
  .replace(/([a-z0-9])([A-Z][a-z])/g,"$1 $2").replace(/\s+/g," ").trim();
 const norm=x=>String(x||"").replace(/[²³]/g,c=>c==="²"?"2":"3").toLowerCase().replace(/[^a-z0-9]/g,"");
 const acr={cop:"COP",scop:"SCOP",npsh:"NPSH",ua:"UA",dhw:"DHW",hvac:"HVAC",cfd:"CFD",re:"Re",ntu:"NTU",pe:"PE",rwa:"RWA",vrf:"VRF"};
 const parts=s.split(" ");
 if(parts.length>1&&norm(parts[parts.length-1])&&norm(parts[parts.length-1])===norm(u))parts.pop();
 s=parts.map(x=>acr[x.toLowerCase()]||x).join(" ");
 return s&&!accronymStart(s)?s.charAt(0).toUpperCase()+s.slice(1):s;
}
function accronymStart(s){return /^[A-Z0-9]{2,}(?:\s|$)/.test(String(s||""))}
function reportNumber(v,l){
 if(typeof v!=="number"||!isFinite(v))return String(v);
 if(v===0)return"0";
 const a=Math.abs(v);
 /* Scientific notation still has to obey the document: toExponential() writes
    an English decimal point and as many digits as it is asked for, so a
    residual printed as -1.01519e-9 sat on a page where every other number used
    a comma and four figures. */
 if(a<1e-6||a>=1e9){
  const ex=v.toExponential(3).split("e");
  let mant=Number(ex[0]);
  try{mant=new Intl.NumberFormat(l||"en",{maximumSignificantDigits:4,useGrouping:false}).format(Number(ex[0]))}
  catch(e){mant=String(ex[0])}
  return mant+"e"+ex[1];
 }
 /* A four-digit integer on an engineering sheet is a year, a degree-day count
    or an identifier far more often than it is a quantity that wants a
    thousands separator: "1.978" printed for the year 1978 is simply wrong.
    Group from five digits up, and only when the value is not a whole number
    small enough to be an identifier. */
 const grouped=!(Number.isInteger(v)&&a<1e4);
 /* Seven significant digits is the precision of the solver, not of the result:
    a room pressure printed as 10,09947 Pa claims a hundred-thousandth of a
    pascal from a model whose own convergence tolerance is coarser than that.
    Four is what an engineering sheet carries. A whole number stays whole, and
    a tool that needs its own precision passes {value, precision} instead. */
 const opt={useGrouping:grouped};
 if(Number.isInteger(v))opt.maximumFractionDigits=0;else opt.maximumSignificantDigits=4;
 try{return new Intl.NumberFormat(l||"en",opt).format(v)}
 catch(e){return String(+v.toPrecision(7))}
}
/* Record units are written in ASCII because a record is machine-readable:
   m3/h, m2, degC. On paper they are typography, and a sheet that prints m3/h
   next to a properly set m³/h reads as two different quantities. Only the
   metre takes a superscript here -- CO2 and H2O are not units of area. */
const UNITMAP={"m3/h":"m³/h","m3/s":"m³/s","m3":"m³","m2":"m²","mm2":"mm²","cm2":"cm²","cm3":"cm³",
 "kg/m3":"kg/m³","kg/m2":"kg/m²","g/m3":"g/m³","W/m2":"W/m²","W/m2K":"W/(m²·K)",
 "W/(m2.K)":"W/(m²·K)","W/(m2·K)":"W/(m²·K)","J/(kg.K)":"J/(kg·K)","kWh/m2":"kWh/m²",
 "degC":"°C","degF":"°F","deg":"°","1/h":"1/h","m3/h.m2":"m³/(h·m²)","l/s.m2":"l/(s·m²)"};
function prettyUnit(u){
 let x=String(u==null?"":u).trim();
 if(!x)return"";
 if(UNITMAP[x])return UNITMAP[x];
 x=x.replace(/\b((?:[munckdhKMG])?m)3\b/g,"$1³").replace(/\b((?:[munckdhKMG])?m)2\b/g,"$1²");
 x=x.replace(/\bdegC\b/g,"°C").replace(/\bdegF\b/g,"°F");
 /* Records write a product of units with a full stop -- m2.K/W -- because a
    record is ASCII. On paper the same document carried both m².K/W and
    W/(m²·K); the separator is a multiplication dot. */
 x=x.replace(/(?<=[A-Za-z0-9°²³)])\.(?=[A-Za-z°(])/g,"·");
 return x;
}
const BOOLUNIT=["0/1","bool","boolean","1/0"];
function reportValue(v,u,l){
 /* Tools mark a flag by giving it the unit 0/1. Sent through the number path
    it printed "1 0/1", which states the encoding and not the answer. */
 if(typeof v==="boolean"||(BOOLUNIT.indexOf(String(u).toLowerCase())>=0&&(v===0||v===1)))
  return tr(v?"rYes":"rNo",l);
 const body=(v==null||v==="")?"—":cellText(v,l);
 const own=v&&typeof v==="object"&&v.unit!==undefined;
 const shownUnit=(u==="-"?"":prettyUnit(u));
 return body+(!own&&shownUnit?" "+cellText(shownUnit,l):"");
}
function reportHTML(opts){
 opts=opts||{};
 const l=opts.lang||currentLang();
 const rec=opts.record||recordBuild();
 if(!rec)return null;
 if(!opts.sections)opts=Object.assign({},opts,{sections:sectionsFor(rec)});
 const items=reportItems(rec,opts,l);
 const foot={pre:attribution({lang:l,timestamp:rec.generated_at,status:statusWord(l,rec.tool.status),
   independent:rec.tool.independent_validation}),
  page:tr("rPage",l)};
 const head=rec.tool.title+" · "+siteName(l);
 const meta=JSON.stringify({head:head,foot:foot});
 return '<!doctype html><html lang="'+l+'"><head><meta charset="utf-8">'
 +'<title>'+esc(rec.tool.title)+" — "+esc(tr("rTitle",l))+"</title><style>"
 +"@page{size:A4;margin:0}"
 +'html,body{margin:0;padding:0;background:#fff;color:#17202a;font:10.25px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
 +".page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;page-break-after:always;break-after:page}"
 +".page:last-child{page-break-after:auto;break-after:auto}"
 +".ph{position:absolute;left:16mm;right:16mm;top:8.5mm;font-size:8.4px;font-weight:600;letter-spacing:.02em;color:#536170;border-bottom:.45pt solid #bac4cf;padding-bottom:1.5mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
 +".pc{position:absolute;left:16mm;right:16mm;top:18mm;bottom:22mm;overflow:hidden}"
 +".pf{position:absolute;left:16mm;right:16mm;bottom:7mm;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:5mm;font-size:7px;line-height:1.3;color:#4b5866;border-top:.45pt solid #bac4cf;padding-top:1.3mm}"
 +".pf-main{overflow-wrap:anywhere}.pf-page{white-space:nowrap;font-weight:650;color:#263442}"
 +".report-lead{margin:0 0 3.2mm;padding:0 0 3.2mm;border-bottom:1.2pt solid #1f5e8c}"
 +".report-kicker{font-size:8.2px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:#1f5e8c;margin-bottom:1mm}"
 +".doctitle{font-size:19px;line-height:1.18;font-weight:720;color:#101820;margin:0 0 2mm}"
 +".report-tags{display:flex;flex-wrap:wrap;gap:1.5mm 3mm;color:#4d5b69;font-size:8.6px}.report-tags b{color:#24313e}"
 +".report-meta{margin:0 0 3mm;border:.5pt solid #cbd4dd;border-radius:2mm;overflow:hidden}"
 +".meta-row{display:grid;grid-template-columns:25mm minmax(0,1fr) 22mm minmax(0,1fr);gap:1.5mm 3mm;padding:1.2mm 2mm;border-bottom:.35pt solid #dce2e8}"
 +".meta-row:last-child{border-bottom:0}.meta-row.wide{grid-template-columns:25mm minmax(0,1fr)}"
 /* The permalink stacks: its label sits above the address, not beside it.
    Beside it, the label wraps to three lines inside a 25 mm column and every
    text extraction of the printed page interleaves those lines with the
    wrapped URL, so the address no longer reads back as one token. Stacked, it
    also gets the full text column: measured 3 lines instead of 9 for a
    639-character link. */
+".meta-row.stack{grid-template-columns:minmax(0,1fr);gap:.6mm 0}"
 +".meta-note{display:block;font-size:7.8px;line-height:1.3;color:#5a6876;margin-top:.5mm}"
 /* The trailer. Its address box wraps at any character -- base64url carries no
    hyphen or slash to break at, so overflow-wrap alone leaves a 3 500-character
    token sticking out of the text column -- and is selectable as one unit. */
 +".perma-trailer{margin:3.5mm 0 0;padding:2mm 2.4mm;border:.5pt solid #cbd4dd;border-radius:2mm;background:#f8fafc}"
 +".pt-url{margin-top:1.3mm;padding:1.3mm 1.6mm;background:#fff;border:.35pt solid #dce2e8;border-radius:1.2mm;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:7.8px;line-height:1.4;overflow-wrap:anywhere;word-break:break-all;user-select:all}"
 +".pt-note{font-size:7.8px;line-height:1.3;color:#5a6876;margin-top:.9mm}"
 +".pt-seg{font-weight:400;color:#5a6876;font-variant-numeric:tabular-nums}"
 +".meta-k{font-size:8px;font-weight:700;letter-spacing:.025em;text-transform:uppercase;color:#5a6876}.meta-v{min-width:0;overflow-wrap:anywhere}.meta-url{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:7.8px;line-height:1.35}"
 +".report-note{margin:0 0 3mm;padding:2mm 2.4mm;background:#f2f6fa;border-left:2.4pt solid #4d7ea5;border-radius:0 1.6mm 1.6mm 0}"
 +".report-note.warn{background:#fff7e6;border-left-color:#c28612}.report-note-title{font-size:8.2px;font-weight:750;letter-spacing:.04em;text-transform:uppercase;color:#435363;margin-bottom:.7mm}"
 +".project-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4pt;margin:0 0 2.5mm;background:#ccd5de;border:.5pt solid #ccd5de;border-radius:1.6mm;overflow:hidden}"
 +".project-grid>div{display:grid;grid-template-columns:28mm minmax(0,1fr);gap:2mm;padding:1.2mm 2mm;background:#fff}.project-grid span{font-size:7.8px;font-weight:700;text-transform:uppercase;color:#5b6874}.project-grid b{font-weight:600;overflow-wrap:anywhere}"
 +".benchmark-strip{margin:0 0 2.6mm;padding:1.5mm 2mm;background:#eef5ec;border-left:2.4pt solid #4d7d46;font-size:8.4px;line-height:1.35}.benchmark-strip .meta-url{margin-top:.7mm}"
 +".metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.8mm;margin:0 0 2.5mm;break-inside:avoid;page-break-inside:avoid}.metric{min-width:0;padding:1.8mm 2mm;border:.55pt solid #b9c7d3;border-radius:1.6mm;background:#f7fafc}.metric-k{font-size:7.8px;font-weight:700;line-height:1.25;text-transform:uppercase;color:#506171}.metric-v{font-size:14px;line-height:1.22;font-weight:720;color:#13283a;margin-top:.6mm;overflow-wrap:anywhere}.metric-note{font-size:7.6px;line-height:1.25;color:#5d6872;margin-top:.5mm}"
 +".check{margin:0 0 1.6mm;padding:1.5mm 2mm;border-left:2.5pt solid #738393;background:#f5f7f9;break-inside:avoid;page-break-inside:avoid}.check-head{display:flex;align-items:baseline;gap:2mm;margin-bottom:.6mm}.check-head span{min-width:19mm;font-size:7.5px;font-weight:750;text-transform:uppercase;letter-spacing:.04em;color:#526170}.check-head b{font-size:9.3px;color:#1e2b38}.check-detail{margin-bottom:.7mm}.check-pass{border-left-color:#3e7c55;background:#f0f7f2}.check-attention{border-left-color:#bc7a0a;background:#fff7e7}.check-fail{border-left-color:#a83b32;background:#fff0ee}.check-info{border-left-color:#477ca4;background:#eef5fa}"
 +".flow{display:flex;align-items:stretch;gap:3.2mm;margin:0 0 2.4mm;break-inside:avoid;page-break-inside:avoid}.flow-node{position:relative;flex:1;min-width:0;padding:2mm 1.8mm 1.6mm 7mm;border:.55pt solid #b8c6d2;border-radius:1.8mm;background:#f7fafc}.flow-node:not(:last-child):after{content:'›';position:absolute;right:-2.7mm;top:50%;transform:translateY(-54%);font-size:16px;font-weight:700;color:#668099}.flow-n{position:absolute;left:1.6mm;top:1.7mm;width:4mm;height:4mm;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#2f678f;color:#fff;font-size:7px;font-weight:700}.flow-node b,.flow-node small{display:block}.flow-node b{font-size:9px}.flow-node small{font-size:7.6px;color:#5c6975;margin-top:.5mm}"
 +".h2{font-size:12px;font-weight:720;margin:4mm 0 1.4mm;padding-bottom:.8mm;border-bottom:.55pt solid #b7c4d0;color:#162536}"
 +".h3{font-size:10.5px;font-weight:700;margin:2.8mm 0 1mm;color:#26384a}"
 +".p{margin:0 0 1.6mm}.p.small{font-size:8.3px;color:#546270}.p.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:8.7px;background:#f2f5f8;padding:1.2mm 1.8mm;border-left:2pt solid #90a4b6}"
 +".p.warn{background:#fff6e2;border-left:2pt solid #c28612;padding:1.2mm 1.8mm}"
 +".url{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:8px;line-height:1.35;overflow-wrap:anywhere;background:#f3f6f8;padding:1.2mm 1.8mm;margin:0 0 1.8mm;user-select:all}"
 +".r{display:grid;gap:2.5mm;padding:1.05mm 1.4mm;border-bottom:.35pt solid #dce2e8}"
 +".r span{overflow-wrap:anywhere}"
 +".r:nth-child(even){background:#fafbfd}.r.kv{grid-template-columns:40mm minmax(0,1fr)}.r.kv.small{font-size:8.3px;color:#52606d}"
 +".r.c2{grid-template-columns:minmax(45mm,1.15fr) minmax(0,1.85fr)}.r.c2 span:last-child{font-variant-numeric:tabular-nums}"
 +".r.c3{grid-template-columns:minmax(0,1fr) 34mm 24mm}.r.c3 span:nth-child(2){text-align:right;font-variant-numeric:tabular-nums}"
 +".r.cN{grid-template-columns:repeat(auto-fit,minmax(0,1fr));font-variant-numeric:tabular-nums}"
 +".qn{display:grid;grid-template-columns:6mm minmax(0,1fr);gap:1.5mm;padding:.8mm 0 .8mm 1.4mm;border-bottom:.35pt solid #e4e9ee;break-inside:avoid;page-break-inside:avoid}"
 +".qn>span{font-weight:700;color:#4a5c6e;text-align:right}"
 +".r.rh{font-weight:720;background:#eaf0f5;border-top:.55pt solid #9fafbd;border-bottom:.55pt solid #9fafbd;color:#263746}"
 /* figures: never wider than the text column, never taller than one page body,
    so a figure item always fits the page the pager put it on */
 +".fig{margin:0 0 2mm;text-align:center;break-inside:avoid;page-break-inside:avoid;max-width:100%}"
 +".fig img,.fig svg{max-width:100%;max-height:158mm;width:auto;height:auto;display:block;margin:0 auto}"
 +".figcap{font-size:8.6px;color:#4a5460;margin:1mm 0 0;text-align:center}"
 +"@media screen{body{background:#5b626b;padding:8px 0}.page{margin:0 auto 8px;box-shadow:0 2px 12px rgba(0,0,0,.45)}}"
 +"</style></head><body><div id=\"src\" style=\"display:none\">"+items.join("")+"</div><div id=\"out\"></div>"
 +"<script>(function(){var M="+meta+";"
 +"var src=document.getElementById('src'),out=document.getElementById('out'),items=[].slice.call(src.children);"
 +"var heads={},pages=[];function np(){var p=document.createElement('div');p.className='page';"
 +"var h=document.createElement('div');h.className='ph';h.textContent=M.head;"
 +"var c=document.createElement('div');c.className='pc';"
 +"var f=document.createElement('div');f.className='pf';f.innerHTML='<span class=\"pf-main\"></span><span class=\"pf-page\"></span>';p.appendChild(h);p.appendChild(c);p.appendChild(f);"
 +"out.appendChild(p);var o={p:p,c:c,f:f};pages.push(o);return o}"
 +"function lay(){"
 +"var pg=np();for(var i=0;i<items.length;i++){var el=items[i];var tbl=el.getAttribute('data-tbl');"
 +"if(el.getAttribute('data-head')&&tbl)heads[tbl]=el;pg.c.appendChild(el);"
 +"var keep=(el.classList.contains('h2')||el.classList.contains('h3')||el.classList.contains('rh'))&&i+1<items.length;"
 +"if(keep){var nx=items[i+1];pg.c.appendChild(nx);var orphan=pg.c.scrollHeight>pg.c.clientHeight;pg.c.removeChild(nx);"
 +"if(orphan&&pg.c.children.length>1){pg.c.removeChild(el);pg=np();pg.c.appendChild(el)}}"
 +"if(pg.c.scrollHeight>pg.c.clientHeight&&pg.c.children.length>1){pg.c.removeChild(el);pg=np();"
 +"if(tbl&&heads[tbl]&&heads[tbl]!==el)pg.c.appendChild(heads[tbl].cloneNode(true));pg.c.appendChild(el);}}"
 +"for(var k=0;k<pages.length;k++){pages[k].f.querySelector('.pf-main').textContent=M.foot.pre;"
 +"pages[k].f.querySelector('.pf-page').textContent=M.foot.page.replace('%n',k+1).replace('%m',pages.length);}"
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
const SNAPSHOT_DATE="2026-10-04";
const SNAPSHOT=[
 {"f":"neutron_transport.html","t":"Neutron Transport (2-D Monte Carlo)","a":["T","p"]},
 {"f":"doppler.html","t":"Doppler Broadening (U-238)","a":["T"]},
 {"f":"spectrum.html","t":"Neutron Flux Spectrum","a":["T"]},
 {"f":"kinetics.html","t":"Point Reactor Kinetics","a":["rho_reac"]},
 {"f":"steam_tables.html","t":"Steam Tables (IAPWS-IF97)","a":["T","p","v","h","s","u","x"]},
 {"f":"corescoping.html","t":"Reactor Core Scoping Studio","a":["T","Q"]},
 {"f":"mollier.html","t":"Mollier i–d / Psychrometric Chart","a":["T","p","w","mdot","Vdot"]},
 {"f":"heat2d.html","t":"2D Heat Transfer","a":["T"]},
 {"f":"vessel_blowdown.html","t":"Relief / Blowdown / Depressurisation","a":["T","p","A","D","L"]},
 {"f":"gasline_packing.html","t":"Gas-Line Packing / Depacking","a":["T","p","mdot","D","L","A"]},
 {"f":"moodydiagram.html","t":"Moody Diagram & Pipe Friction","a":["T","p","Vdot"]},
 {"f":"operatingpoint.html","t":"Pump & Fan Operating Point","a":["T","p","D","L","rho","Vdot","dp"]},
 {"f":"steam_pipe_pressure_loss.html","t":"Steam Pipe Pressure Loss","a":["T","p","mdot","D","L"]},
 {"f":"ventilation.html","t":"Room Ventilation Calculator","a":["Q"]},
 {"f":"flashing_valve.html","t":"Flashing Through Valve / Orifice","a":["T","p","A"]},
 {"f":"klimaatcalculator.html","t":"Ventilation & Cooling Cost Estimator","a":["T","p","w","Q"]},
 {"f":"relief_valve_sizing.html","t":"Relief Valve Sizing — Preliminary","a":["T","p","rho","mdot"]},
 {"f":"two_phase_critical_flow.html","t":"Two-Phase Critical Flow","a":["T","p","A"]},
 {"f":"pipe_filling_draining.html","t":"Pipe Filling / Draining","a":["D","L","rho","Vdot"]},
 {"f":"tank_pressurisation.html","t":"Tank Pressurisation","a":["T","p","A"]},
 {"f":"heat_exchangers.html","t":"Heat Exchanger Calculator","a":["T","p","mdot"]},
 {"f":"wallthermalcalculator.html","t":"Wall & Envelope Thermal Calculator","a":["T","p","w"]},
 {"f":"cablesizing.html","t":"Cable Sizing","a":["I","L","V_volt","Ik","t_clear"]},
 {"f":"shortcircuit.html","t":"IEC 60909 Short-Circuit","a":["V_volt","Z","XR"]},
 {"f":"hydraulicnetwork.html","t":"Hydraulic Network Solver","a":["rho","D","L"]},
 {"f":"protectioncoordination.html","t":"Protection Coordination Studio","a":["Ik","ip","Ib","Ith","Ires","V_volt"]},
 {"f":"ductnetwork.html","t":"Duct Network Solver","a":["rho","D","L"]},
 {"f":"waterhammer.html","t":"Water Hammer Transient Sandbox","a":["D","L","rho","Vdot"]},
 {"f":"regelkring.html","t":"Control Loop Laboratory","a":["T"]},
 {"f":"luchtgroepselector.html","t":"Air Handling Unit Specification Aid","a":["Vdot","T","w"]},
 {"f":"verwarmenkoelenselector.html","t":"Heating & Cooling System Selector","a":["Q"]},
 {"f":"ontvochtiging.html","t":"Dehumidification Method Selector","a":["T","p","w"]},
 {"f":"cfd.html","t":"Voxel CFD — Room & Ventilation Studio","a":["T","w"]}
];
let CATALOG=null,CATALOG_INJECTED=null;
function catalogFetch(){
 if(CATALOG)return CATALOG;
 /* no server behind a file:// copy — do not even try, it only logs a CORS error */
 if(location.protocol==="file:"){CATALOG=Promise.resolve(null);return CATALOG}
 CATALOG=fetch("catalog.php",{cache:"no-cache"}).then(r=>r.ok?r.json():Promise.reject(r.status)).catch(()=>null);
 /* Whoever asked for the catalogue, the workflow buttons reconcile with it: the
    button is drawn offline from the manifest or the embedded snapshot, the menu
    is filled from here, and a snapshot older than workflow-map.json made the two
    disagree (a button whose menu then listed no tool). */
 try{CATALOG.then(c=>{try{wfSetEdges(wfCatalogEdges(c))}catch(e){warn(e)}},()=>{})}catch(e){warn(e)}
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

/* ---------- workflow: next step, project chip, attach (v4.15) ----------
   TZ-engineering-workflow.md §6. Everything below is wrapped: a failure here
   leaves the bar exactly as v4.14 built it. Strings are merged into T so the
   ordinary tr() lookup serves them. */
Object.assign(T,{
 wfContinue:{en:"Continue with →",uk:"Продовжити в →",de:"Weiter mit →",nl:"Verder met →",fr:"Continuer avec →",es:"Continuar con →",pl:"Kontynuuj w →"},
 wfNone:{en:"The catalogue records no next tool for this one.",uk:"Каталог не містить наступного інструмента для цього.",de:"Der Katalog verzeichnet für dieses Werkzeug kein nachfolgendes.",nl:"De catalogus vermeldt geen volgende tool voor deze.",fr:"Le catalogue n'indique aucun outil suivant pour celui-ci.",es:"El catálogo no registra ninguna herramienta siguiente para esta.",pl:"Katalog nie wskazuje kolejnego narzędzia dla tego."},
 wfSnapshot:{en:"The tool catalogue cannot be read here, so these next steps come from a stored snapshot (%s) and may be out of date.",uk:"Каталог інструментів тут недоступний, тому ці наступні кроки взято зі збереженого знімка (%s) і вони можуть бути застарілими.",de:"Der Werkzeugkatalog ist hier nicht lesbar; diese nächsten Schritte stammen aus einem gespeicherten Abzug (%s) und können veraltet sein.",nl:"De catalogus is hier niet leesbaar; deze vervolgstappen komen uit een opgeslagen momentopname (%s) en kunnen verouderd zijn.",fr:"Le catalogue des outils n'est pas lisible ici : ces étapes suivantes proviennent d'un instantané enregistré (%s) et peuvent être périmées.",es:"El catálogo no se puede leer aquí: estos pasos siguientes proceden de una instantánea guardada (%s) y pueden estar desactualizados.",pl:"Katalogu narzędzi nie można tu odczytać, dlatego te kolejne kroki pochodzą z zapisanej migawki (%s) i mogą być nieaktualne."},
 wfHandoff:{en:"Opens with the quantities %s",uk:"Відкривається з величинами %s",de:"Öffnet mit den Größen %s",nl:"Opent met de grootheden %s",fr:"S'ouvre avec les grandeurs %s",es:"Se abre con las magnitudes %s",pl:"Otwiera się z wielkościami %s"},
 wfPackage:{en:"Reads the project package stored in this browser",uk:"Читає пакет проєкту, збережений у цьому браузері",de:"Liest das in diesem Browser gespeicherte Projektpaket",nl:"Leest het projectpakket dat in deze browser is opgeslagen",fr:"Lit le paquet de projet enregistré dans ce navigateur",es:"Lee el paquete de proyecto guardado en este navegador",pl:"Odczytuje pakiet projektu zapisany w tej przeglądarce"},
 wfMore:{en:"Show %n more",uk:"Показати ще %n",de:"%n weitere anzeigen",nl:"Nog %n tonen",fr:"Afficher %n de plus",es:"Mostrar %n más",pl:"Pokaż jeszcze %n"},
 wfLink:{en:"Opens the tool; the result is carried over by hand",uk:"Відкриває інструмент; результат переносять вручну",de:"Öffnet das Werkzeug; das Ergebnis wird von Hand übertragen",nl:"Opent de tool; het resultaat neemt u met de hand over",fr:"Ouvre l'outil ; le résultat se reporte à la main",es:"Abre la herramienta; el resultado se traslada a mano",pl:"Otwiera narzędzie; wynik przenosi się ręcznie"},
 pjChip:{en:"Project: %p · rev. %r",uk:"Проєкт: %p · ред. %r",de:"Projekt: %p · Rev. %r",nl:"Project: %p · rev. %r",fr:"Projet : %p · rév. %r",es:"Proyecto: %p · rev. %r",pl:"Projekt: %p · rew. %r"},
 pjChipTitle:{en:"Project package stored in this browser: %p, revision %r, updated %u.",uk:"Пакет проєкту, збережений у цьому браузері: %p, редакція %r, оновлено %u.",de:"In diesem Browser gespeichertes Projektpaket: %p, Revision %r, aktualisiert %u.",nl:"Projectpakket in deze browser: %p, revisie %r, bijgewerkt %u.",fr:"Paquet de projet enregistré dans ce navigateur : %p, révision %r, mis à jour %u.",es:"Paquete de proyecto guardado en este navegador: %p, revisión %r, actualizado %u.",pl:"Pakiet projektu zapisany w tej przeglądarce: %p, rewizja %r, aktualizacja %u."},
 pjUnnamed:{en:"(unnamed)",uk:"(без назви)",de:"(ohne Namen)",nl:"(naamloos)",fr:"(sans nom)",es:"(sin nombre)",pl:"(bez nazwy)"},
 pjAttach:{en:"Attach to project",uk:"Додати до проєкту",de:"Dem Projekt anhängen",nl:"Aan project koppelen",fr:"Joindre au projet",es:"Adjuntar al proyecto",pl:"Dołącz do projektu"},
 pjHead:{en:"Attach this calculation to the project",uk:"Додати цей розрахунок до проєкту",de:"Diese Berechnung dem Projekt anhängen",nl:"Deze berekening aan het project koppelen",fr:"Joindre ce calcul au projet",es:"Adjuntar este cálculo al proyecto",pl:"Dołącz to obliczenie do projektu"},
 pjWhere:{en:"Inputs, outputs, units, model and warnings of the current record are stored under calculations.%t in the project package in this browser.",uk:"Вхідні дані, результати, одиниці, модель і попередження поточного запису зберігаються в calculations.%t пакета проєкту в цьому браузері.",de:"Eingaben, Ergebnisse, Einheiten, Modell und Warnungen des aktuellen Protokolls werden unter calculations.%t im Projektpaket dieses Browsers gespeichert.",nl:"Invoer, uitvoer, eenheden, model en waarschuwingen van het huidige record worden opgeslagen onder calculations.%t in het projectpakket in deze browser.",fr:"Les entrées, sorties, unités, modèle et avertissements du relevé actuel sont enregistrés sous calculations.%t dans le paquet de projet de ce navigateur.",es:"Las entradas, salidas, unidades, modelo y advertencias del registro actual se guardan en calculations.%t del paquete de proyecto de este navegador.",pl:"Dane wejściowe, wyniki, jednostki, model i ostrzeżenia bieżącego rekordu są zapisywane w calculations.%t pakietu projektu w tej przeglądarce."},
 pjSystem:{en:"System",uk:"Система",de:"System",nl:"Systeem",fr:"Système",es:"Sistema",pl:"System"},
 pjPackage:{en:"Package",uk:"Пакет робіт",de:"Paket",nl:"Pakket",fr:"Lot",es:"Paquete",pl:"Pakiet"},
 pjTag:{en:"Tag",uk:"Позначення (тег)",de:"Kennzeichen (Tag)",nl:"Tag",fr:"Repère (tag)",es:"Etiqueta (tag)",pl:"Oznaczenie (tag)"},
 pjName:{en:"Title",uk:"Назва",de:"Titel",nl:"Titel",fr:"Titre",es:"Título",pl:"Tytuł"},
 pjEntry:{en:"Entry",uk:"Запис",de:"Eintrag",nl:"Invoer",fr:"Entrée",es:"Entrada",pl:"Wpis"},
 pjNewEntry:{en:"New entry",uk:"Новий запис",de:"Neuer Eintrag",nl:"Nieuwe invoer",fr:"Nouvelle entrée",es:"Entrada nueva",pl:"Nowy wpis"},
 pjReplace:{en:"Replace %s",uk:"Замінити %s",de:"%s ersetzen",nl:"%s vervangen",fr:"Remplacer %s",es:"Sustituir %s",pl:"Zastąp %s"},
 pjNone:{en:"— none —",uk:"— немає —",de:"— keine —",nl:"— geen —",fr:"— aucun —",es:"— ninguno —",pl:"— brak —"},
 pjNoStructure:{en:"The package lists no systems or packages yet; a tag and a title are enough to attach.",uk:"Пакет ще не містить систем чи пакетів робіт; для додавання достатньо тегу й назви.",de:"Das Paket enthält noch keine Systeme oder Pakete; Kennzeichen und Titel genügen zum Anhängen.",nl:"Het pakket bevat nog geen systemen of pakketten; een tag en een titel volstaan om te koppelen.",fr:"Le paquet ne contient encore ni système ni lot ; un repère et un titre suffisent pour joindre.",es:"El paquete aún no contiene sistemas ni paquetes; basta una etiqueta y un título para adjuntar.",pl:"Pakiet nie zawiera jeszcze systemów ani pakietów; do dołączenia wystarczą oznaczenie i tytuł."},
 pjSave:{en:"Attach",uk:"Додати",de:"Anhängen",nl:"Koppelen",fr:"Joindre",es:"Adjuntar",pl:"Dołącz"},
 pjCancel:{en:"Cancel",uk:"Скасувати",de:"Abbrechen",nl:"Annuleren",fr:"Annuler",es:"Cancelar",pl:"Anuluj"},
 pjDone:{en:"Attached to %p as %i (package revision %r).",uk:"Додано до %p як %i (редакція пакета %r).",de:"%p angehängt als %i (Paketrevision %r).",nl:"Gekoppeld aan %p als %i (pakketrevisie %r).",fr:"Joint à %p sous %i (révision du paquet %r).",es:"Adjuntado a %p como %i (revisión del paquete %r).",pl:"Dołączono do %p jako %i (rewizja pakietu %r)."},
 pjFail:{en:"The calculation was not attached: %s",uk:"Розрахунок не додано: %s",de:"Die Berechnung wurde nicht angehängt: %s",nl:"De berekening is niet gekoppeld: %s",fr:"Le calcul n'a pas été joint : %s",es:"El cálculo no se adjuntó: %s",pl:"Obliczenia nie dołączono: %s"},
 pjNoRuntime:{en:"the project runtime (diagram-project.js) could not be loaded",uk:"не вдалося завантажити середовище проєкту (diagram-project.js)",de:"die Projektlaufzeit (diagram-project.js) konnte nicht geladen werden",nl:"de projectruntime (diagram-project.js) kon niet worden geladen",fr:"le moteur de projet (diagram-project.js) n'a pas pu être chargé",es:"no se pudo cargar el entorno de proyecto (diagram-project.js)",pl:"nie udało się wczytać środowiska projektu (diagram-project.js)"},
 pjOldRuntime:{en:"the project runtime loaded on this page predates attachCalculation()",uk:"середовище проєкту на цій сторінці старіше за attachCalculation()",de:"die auf dieser Seite geladene Projektlaufzeit ist älter als attachCalculation()",nl:"de projectruntime op deze pagina is ouder dan attachCalculation()",fr:"le moteur de projet chargé sur cette page est antérieur à attachCalculation()",es:"el entorno de proyecto cargado en esta página es anterior a attachCalculation()",pl:"środowisko projektu wczytane na tej stronie jest starsze niż attachCalculation()"},
 pjUnstored:{en:"%i was added to the project (revision %r), but this browser did not store it: %s. Save the file to keep the change.",uk:"%i додано до проєкту (редакція %r), але цей браузер його не зберіг: %s. Збережіть файл, щоб не втратити зміну.",de:"%i wurde dem Projekt hinzugefügt (Revision %r), von diesem Browser aber nicht gespeichert: %s. Speichern Sie die Datei, um die Änderung zu behalten.",nl:"%i is aan het project toegevoegd (revisie %r), maar deze browser heeft het niet opgeslagen: %s. Sla het bestand op om de wijziging te behouden.",fr:"%i a été joint au projet (révision %r), mais ce navigateur ne l'a pas enregistré : %s. Enregistrez le fichier pour conserver la modification.",es:"%i se añadió al proyecto (revisión %r), pero este navegador no lo guardó: %s. Guarde el archivo para conservar el cambio.",pl:"%i dodano do projektu (rewizja %r), ale ta przeglądarka go nie zapisała: %s. Zapisz plik, aby zachować zmianę."},
 pjQuotaWhy:{en:"the storage of this browser is full",uk:"сховище цього браузера заповнене",de:"der Speicher dieses Browsers ist voll",nl:"de opslag van deze browser is vol",fr:"le stockage de ce navigateur est plein",es:"el almacenamiento de este navegador está lleno",pl:"pamięć tej przeglądarki jest pełna"},
 pjStoreWhy:{en:"this browser refused the write",uk:"цей браузер відхилив запис",de:"dieser Browser hat den Schreibvorgang abgelehnt",nl:"deze browser weigerde de schrijfopdracht",fr:"ce navigateur a refusé l'écriture",es:"este navegador rechazó la escritura",pl:"ta przeglądarka odrzuciła zapis"},
 pjSaveFile:{en:"Save the project file",uk:"Зберегти файл проєкту",de:"Projektdatei speichern",nl:"Projectbestand opslaan",fr:"Enregistrer le fichier de projet",es:"Guardar el archivo de proyecto",pl:"Zapisz plik projektu"},
 pjGone:{en:"no project package is stored in this browser any more",uk:"у цьому браузері більше не збережено пакета проєкту",de:"in diesem Browser ist kein Projektpaket mehr gespeichert",nl:"er is geen projectpakket meer opgeslagen in deze browser",fr:"aucun paquet de projet n'est plus enregistré dans ce navigateur",es:"ya no hay ningún paquete de proyecto guardado en este navegador",pl:"w tej przeglądarce nie ma już zapisanego pakietu projektu"}
});
/* WF-SNAPSHOT:BEGIN — generated by regen-snapshot.py from catalog.php; do not edit by hand.
   id -> {f:file, t:English title, h|p|l:[next tool ids carried by handoff | package | link]} */
const WF_SNAPSHOT_DATE="2026-10-11";
const WF_SNAPSHOT={
 "bidevaluation":{"f":"bidevaluation.html","t":{"en":"Technical Bid Evaluation","uk":"Технічна оцінка пропозицій","de":"Technische Bewertung der Angebote","nl":"Technische beoordeling van offertes","fr":"Évaluation technique des offres","es":"Evaluación técnica de ofertas","pl":"Techniczna ocena ofert"},"p":["deviationregister","packagereadiness","projectworkspace"],"l":["vendordocuments"]},
 "bowtiebuilder":{"f":"bowtiebuilder.html","t":{"en":"Bow-Tie Barrier Builder","uk":"Конструктор бар’єрів Bow-Tie","de":"Bow-Tie-Barrieren-Editor","nl":"Bow-tie barrièrebouwer","fr":"Éditeur de barrières nœud papillon","es":"Editor de barreras bow-tie","pl":"Edytor barier bow-tie"},"l":["incidenttree"]},
 "building-change-of-use":{"f":"building-change-of-use.html","t":{"en":"Building Change of Use Checker","uk":"Перевірка зміни призначення будівлі","de":"Prüfung einer Nutzungsänderung","nl":"Checker voor functiewijziging van gebouwen","fr":"Vérificateur de changement d’usage du bâtiment","es":"Comprobador de cambio de uso del edificio","pl":"Kontrola zmiany sposobu użytkowania budynku"},"l":["loadlist","roomacoustics","ventilation","wallthermalcalculator"]},
 "cablesizing":{"f":"cablesizing.html","t":{"en":"Cable Sizing","uk":"Розрахунок перерізу кабелю","de":"Kabeldimensionierung","nl":"Kabeldimensionering","fr":"Dimensionnement des câbles","es":"Dimensionado de cables","pl":"Dobór przekroju kabli"},"h":["protectioncoordination","shortcircuit"]},
 "causeeffect":{"f":"causeeffect.html","t":{"en":"Cause & Effect Matrix","uk":"Матриця причин і наслідків","de":"Ursache-Wirkungs-Matrix","nl":"Oorzaak-gevolgmatrix","fr":"Matrice causes-effets","es":"Matriz causa-efecto","pl":"Macierz przyczyn i skutków"},"p":["controlsoftwarechange","functionaltest","iolist","packagereadiness","projectworkspace"],"l":["plcddclab"]},
 "cfd":{"f":"cfd.html","t":{"en":"Voxel CFD — Room & Ventilation Studio","uk":"Voxel CFD — студія приміщень і вентиляції","de":"Voxel CFD — Raum- und Lüftungsstudio","nl":"Voxel CFD — ruimte- en ventilatiestudio","fr":"Voxel CFD — studio local et ventilation","es":"Voxel CFD — estudio de recintos y ventilación","pl":"Voxel CFD — studio pomieszczeń i wentylacji"},"h":["klimaatcalculator","luchtgroepselector","mollier","moodydiagram","ontvochtiging","operatingpoint","ventilation","verwarmenkoelenselector","wallthermalcalculator"]},
 "changeimpact":{"f":"changeimpact.html","t":{"en":"Design Change Impact Mapper","uk":"Карта впливу проєктних змін","de":"Auswirkungsanalyse für Designänderungen","nl":"Impactanalyse van ontwerpwijzigingen","fr":"Cartographie des impacts d’une modification de conception","es":"Mapa de impacto de cambios de diseño","pl":"Mapa wpływu zmian projektowych"},"p":["bidevaluation","commissioningturnover","deliverablesplanner","designreview","deviationregister","equipmentdatasheet","interfacebuilder","packagereadiness","projectdefinition","projectworkspace","requirementsmatrix","technicalrequisition","vendordocuments"],"l":["controlsoftwarechange","operatingenvelope","postmodificationverification","temporaryconfigurationbypassrisk","tieinoutageplanner","variationtimeimpact"]},
 "commissioningturnover":{"f":"commissioningturnover.html","t":{"en":"Commissioning & Turnover Planner","uk":"Планувальник пусконалагодження та передачі","de":"Planer für Inbetriebnahme und Übergabe","nl":"Planner voor inbedrijfstelling en overdracht","fr":"Planificateur de mise en service et transfert","es":"Planificador de puesta en marcha y entrega","pl":"Planer rozruchu i przekazania"},"p":["bidevaluation","causeeffect","changeimpact","deliverablesplanner","designreview","deviationregister","equipmentdatasheet","functionaldescription","functionaltest","interfacebuilder","iolist","loadlist","packagereadiness","projectworkspace","requirementsmatrix","technicalrequisition","vendordocuments"]},
 "confinedspace":{"f":"confinedspace.html","t":{"en":"Confined Space Entry Planner","uk":"Планувальник входу в замкнений простір","de":"Einstiegsplaner für enge Räume","nl":"Toetredingsplanner besloten ruimte","fr":"Planificateur d’entrée en espace confiné","es":"Planificador de entrada en espacio confinado","pl":"Planer wejścia do przestrzeni zamkniętej"},"l":["permitworkstudio"]},
 "controlsoftwarechange":{"f":"controlsoftwarechange.html","t":{"en":"Control & Software Change","uk":"Зміна керування та ПЗ","de":"Änderung von Steuerung & Software","nl":"Wijziging van besturing & software","fr":"Modification contrôle-commande & logiciel","es":"Cambio de control y software","pl":"Zmiana sterowania i oprogramowania"},"l":["postmodificationverification"]},
 "corescoping":{"f":"corescoping.html","t":{"en":"Reactor Core Scoping Studio","uk":"Студія оцінки активної зони","de":"Reaktorkern-Auslegungsstudio","nl":"Reactorkern-verkenningsstudio","fr":"Studio de dimensionnement de cœur","es":"Estudio de dimensionado de núcleo","pl":"Studio doboru rdzenia reaktora"},"h":["kinetics","neutron-transport"]},
 "cyclingfatiguelife":{"f":"cyclingfatiguelife.html","t":{"en":"Cycling & Fatigue Life","uk":"Циклічність і втомна довговічність","de":"Zyklen und Ermüdungslebensdauer","nl":"Cycli en vermoeiingslevensduur","fr":"Cyclage et durée de vie en fatigue","es":"Ciclos y vida a fatiga","pl":"Cykle i trwałość zmęczeniowa"},"p":["designbasisintegritylto"],"l":["maintenance-test-interval-change","repairreplace"]},
 "degradationlifeprojector":{"f":"degradationlifeprojector.html","t":{"en":"Degradation Life Projector","uk":"Прогноз ресурсу за деградацією","de":"Lebensdauerprognose aus Degradation","nl":"Levensduurprojector op basis van degradatie","fr":"Projection de durée de vie par dégradation","es":"Proyector de vida por degradación","pl":"Prognoza trwałości na podstawie degradacji"},"p":["designbasisintegritylto"],"l":["maintenance-test-interval-change","repairreplace"]},
 "deliverablesplanner":{"f":"deliverablesplanner.html","t":{"en":"Engineering Deliverables Planner","uk":"Планувальник інженерних результатів","de":"Planer für Engineering-Liefergegenstände","nl":"Planner voor engineering-deliverables","fr":"Planificateur des livrables d’ingénierie","es":"Planificador de entregables de ingeniería","pl":"Planer rezultatów inżynierskich"},"p":["changeimpact","designreview","packagereadiness","projectworkspace"]},
 "designbasisintegritylto":{"f":"designbasisintegritylto.html","t":{"en":"Design Basis Integrity & LTO","uk":"Цілісність проєктної основи та LTO","de":"Integrität der Auslegungsgrundlage & LTO","nl":"Integriteit ontwerpbasis & LTO","fr":"Intégrité de la base de conception & LTO","es":"Integridad de la base de diseño y LTO","pl":"Integralność podstawy projektowej i LTO"},"l":["changeimpact"]},
 "designreview":{"f":"designreview.html","t":{"en":"Design Review Readiness","uk":"Готовність до перевірки проєкту","de":"Bereitschaft zur Designprüfung","nl":"Gereedheid voor ontwerpbeoordeling","fr":"Préparation à la revue de conception","es":"Preparación para la revisión de diseño","pl":"Gotowość do przeglądu projektu"},"p":["changeimpact","commissioningturnover","packagereadiness","projectworkspace"]},
 "deviationregister":{"f":"deviationregister.html","t":{"en":"Deviation / Clarification Register","uk":"Реєстр відхилень і запитів","de":"Register der Abweichungen und Klärungen","nl":"Register van afwijkingen en concessies","fr":"Registre des dérogations et questions","es":"Registro de desviaciones y aclaraciones","pl":"Rejestr odstępstw i wyjaśnień"},"p":["commissioningturnover","packagereadiness","projectworkspace"],"l":["changeimpact"]},
 "doppler":{"f":"doppler.html","t":{"en":"Doppler Broadening (U-238)","uk":"Доплерівське розширення (U-238)","de":"Doppler-Verbreiterung (U-238)","nl":"Dopplerverbreding (U-238)","fr":"Élargissement Doppler (U-238)","es":"Ensanchamiento Doppler (U-238)","pl":"Poszerzenie Dopplera (U-238)"},"h":["spectrum"]},
 "ductnetwork":{"f":"ductnetwork.html","t":{"en":"Duct Network Solver","uk":"Розрахунок мереж повітроводів","de":"Luftkanal-Netzberechner","nl":"Luchtkanaal-netwerkberekenaar","fr":"Solveur de réseau aéraulique","es":"Solucionador de redes de conductos","pl":"Solver sieci kanałów"},"h":["luchtgroepselector","mollier","moodydiagram","operatingpoint"],"p":["equipmentdatasheet"]},
 "electricalnetwork":{"f":"electricalnetwork.html","t":{"en":"Electrical Network","uk":"Електрична мережа","de":"Elektrisches Netz","nl":"Elektrisch netwerk","fr":"Réseau électrique","es":"Red eléctrica","pl":"Sieć elektryczna"},"h":["cablesizing","protectioncoordination","shortcircuit"]},
 "electricalsafework":{"f":"electricalsafework.html","t":{"en":"Electrical Safe-Work Boundary Lab","uk":"Лабораторія безпечної підготовки електричних робіт","de":"Labor für die sichere Vorbereitung elektrischer Arbeiten","nl":"Lab voor veilige voorbereiding van elektrisch werk","fr":"Laboratoire de préparation sûre des travaux électriques","es":"Laboratorio de preparación segura de trabajos eléctricos","pl":"Laboratorium bezpiecznego przygotowania prac elektrycznych"},"l":["permitworkstudio"]},
 "equipmentdatasheet":{"f":"equipmentdatasheet.html","t":{"en":"Equipment Datasheet Builder","uk":"Листи даних обладнання","de":"Gerätedatenblatt-Editor","nl":"Databladen voor apparatuur","fr":"Éditeur de fiches techniques d’équipement","es":"Editor de hojas de datos de equipos","pl":"Kreator kart danych urządzeń"},"p":["changeimpact","packagereadiness","projectworkspace","technicalrequisition"],"l":["vendordocuments"]},
 "equivalence":{"f":"equivalence.html","t":{"en":"Replacement Equivalence Evaluator","uk":"Оцінювач еквівалентності заміни","de":"Bewertung der Ersatzäquivalenz","nl":"Evaluator voor vervangingsequivalentie","fr":"Évaluateur d’équivalence de remplacement","es":"Evaluador de equivalencia de sustitución","pl":"Ocena równoważności zamiennika"},"l":["changeimpact","postmodificationverification"]},
 "flashing-valve-orifice":{"f":"flashing_valve.html","t":{"en":"Flashing Through Valve / Orifice","uk":"Скипання через клапан / отвір","de":"Entspannung mit Flashverdampfung","nl":"Flashverdamping door klep / orifice","fr":"Détente avec vaporisation flash","es":"Expansión con vaporización flash","pl":"Rozprężanie z odparowaniem flash"},"h":["heat-exchangers","hydraulicnetwork","pipe-filling-draining","relief-valve-sizing","steam-tables","tank-pressurisation","two-phase-critical-flow","vessel-blowdown","waterhammer"],"p":["equipmentdatasheet"]},
 "functionaldescription":{"f":"functionaldescription.html","t":{"en":"Functional Description Builder","uk":"Конструктор функціонального опису","de":"Funktionsbeschreibung – Editor","nl":"Functionele beschrijving – bouwer","fr":"Générateur de description fonctionnelle","es":"Generador de descripción funcional","pl":"Kreator opisu funkcjonalnego"},"p":["causeeffect","controlsoftwarechange","functionaltest","iolist","projectworkspace"]},
 "functionaltest":{"f":"functionaltest.html","t":{"en":"Functional Tests","uk":"Функціональні випробування","de":"Funktionsprüfungen","nl":"Functionele testen","fr":"Essais fonctionnels","es":"Pruebas funcionales","pl":"Próby funkcjonalne"},"p":["commissioningturnover","controlsoftwarechange","projectworkspace"]},
 "gas-dynamics-laboratory":{"f":"gasdynamics.html","t":{"en":"Gas Dynamics Laboratory","uk":"Лабораторія газової динаміки","de":"Gasdynamik-Labor","nl":"Gasdynamicalaboratorium","fr":"Laboratoire de dynamique des gaz","es":"Laboratorio de dinámica de gases","pl":"Laboratorium dynamiki gazów"},"h":["gasline-packing","heat-exchangers","moodydiagram","operatingpoint","relief-valve-sizing","steam-tables"]},
 "gasline-packing":{"f":"gasline_packing.html","t":{"en":"Gas-Line Packing / Depacking","uk":"Заповнення / спорожнення газопроводу","de":"Gasleitungs-Packen / Entpacken","nl":"Gasleiding linepack op-/afbouw","fr":"Stockage / déstockage en conduite de gaz","es":"Empaquetado / desempaquetado de gasoducto","pl":"Napełnianie / opróżnianie gazociągu"},"h":["heat-exchangers","operatingpoint","relief-valve-sizing","tank-pressurisation","vessel-blowdown"]},
 "gesloten-atmosfeer":{"f":"gesloten-atmosfeer.html","t":{"en":"Closed-Atmosphere Life Support","uk":"Життєзабезпечення замкненої атмосфери","de":"Lebenserhaltung in geschlossener Atmosphäre","nl":"Levensondersteuning in gesloten atmosfeer","fr":"Survie en atmosphère close","es":"Soporte vital en atmósfera cerrada","pl":"Podtrzymywanie życia w atmosferze zamkniętej"},"h":["cfd","klimaatcalculator","luchtgroepselector","mollier","moodydiagram","ontvochtiging","operatingpoint","wallthermalcalculator"]},
 "h2-co2-pipeline-repurposing":{"f":"h2_co2_pipeline_repurposing.html","t":{"en":"H₂ / CO₂ Pipeline Repurposing","uk":"Перепрофілювання трубопроводу для H₂ / CO₂","de":"Umwidmung von H₂-/CO₂-Pipelines","nl":"Herbestemming van H₂-/CO₂-pijpleidingen","fr":"Reconversion de pipelines H₂ / CO₂","es":"Reconversión de tuberías para H₂ / CO₂","pl":"Zmiana przeznaczenia rurociągu na H₂ / CO₂"},"l":["changeimpact","designbasisintegritylto"]},
 "heat-exchangers":{"f":"heat_exchangers.html","t":{"en":"Heat Exchanger Calculator","uk":"Розрахунок теплообмінників","de":"Wärmeübertrager-Rechner","nl":"Warmtewisselaar-calculator","fr":"Calcul d’échangeurs de chaleur","es":"Cálculo de intercambiadores de calor","pl":"Kalkulator wymiennika ciepła"},"h":["gasline-packing","moodydiagram","operatingpoint","relief-valve-sizing","steam-pipe-pressure-loss","steam-tables"],"p":["equipmentdatasheet"]},
 "hotworkrisk":{"f":"hotworkrisk.html","t":{"en":"Hot Work Risk Studio","uk":"Студія ризиків вогневих робіт","de":"Heißarbeiten-Risikostudio","nl":"Studio risico's heet werk","fr":"Studio des risques de travaux par point chaud","es":"Estudio de riesgos de trabajos en caliente","pl":"Studio ryzyka prac pożarowo niebezpiecznych"},"l":["permitworkstudio"]},
 "hydraulicnetwork":{"f":"hydraulicnetwork.html","t":{"en":"Hydraulic Network Solver","uk":"Розрахунок гідравлічних мереж","de":"Hydraulischer Netzberechner","nl":"Hydraulisch netwerkberekenaar","fr":"Solveur de réseau hydraulique","es":"Solucionador de redes hidráulicas","pl":"Solver sieci hydraulicznej"},"h":["gasline-packing","moodydiagram","operatingpoint","pipe-filling-draining","relief-valve-sizing","steam-pipe-pressure-loss","vessel-blowdown","waterhammer"],"p":["equipmentdatasheet"]},
 "hydraulicsolutions":{"f":"hydraulicsolutions.html","t":{"en":"Hydraulic Circuit Solutions","uk":"Бібліотека гідравлічних схем","de":"Hydraulische Schaltungen — Lösungsbibliothek","nl":"Hydraulische schakelingen — oplossingenbibliotheek","fr":"Schémas hydrauliques — bibliothèque de solutions","es":"Esquemas hidráulicos — biblioteca de soluciones","pl":"Rozwiązania układów hydraulicznych"},"l":["regelkring"]},
 "interfacebuilder":{"f":"interfacebuilder.html","t":{"en":"Interface Definition Studio","uk":"Студія визначення інтерфейсів","de":"Studio zur Schnittstellendefinition","nl":"Studio voor interfacedefinitie","fr":"Studio de définition des interfaces","es":"Estudio de definición de interfaces","pl":"Studio definicji interfejsów"},"p":["bidevaluation","causeeffect","changeimpact","commissioningturnover","deliverablesplanner","designreview","deviationregister","equipmentdatasheet","functionaldescription","functionaltest","iolist","loadlist","packagereadiness","projectworkspace","requirementsmatrix","technicalrequisition","vendordocuments"]},
 "iolist":{"f":"iolist.html","t":{"en":"I/O List","uk":"Перелік сигналів вводу/виводу","de":"E/A-Liste","nl":"I/O-lijst","fr":"Liste des entrées/sorties","es":"Lista de E/S","pl":"Lista sygnałów we/wy"},"p":["causeeffect","controlsoftwarechange","functionaldescription","functionaltest","packagereadiness","projectworkspace"]},
 "isolationplanner":{"f":"isolationplanner.html","t":{"en":"LOTO / Isolation Planner","uk":"Планувальник LOTO та ізоляції енергії","de":"LOTO- und Freischaltplaner","nl":"LOTO- en scheidingsplanner","fr":"Planificateur LOTO et consignation","es":"Planificador LOTO y de aislamiento","pl":"Planer LOTO i odłączeń energii"},"l":["permitworkstudio"]},
 "jsatrabuilder":{"f":"jsatrabuilder.html","t":{"en":"JSA / TRA Builder","uk":"Конструктор JSA / TRA","de":"JSA-/TRA-Editor","nl":"JSA/TRA-bouwer","fr":"Éditeur JSA / TRA","es":"Editor de JSA / TRA","pl":"Kreator JSA / TRA"},"l":["permitworkstudio","ppedecision"]},
 "klimaatcalculator":{"f":"klimaatcalculator.html","t":{"en":"Ventilation & Cooling Cost Estimator","uk":"Оцінювач вартості вентиляції та охолодження","de":"Kostenschätzer für Lüftung & Kühlung","nl":"Kostenraming ventilatie & koeling","fr":"Estimateur de coûts ventilation & refroidissement","es":"Estimador de costes de ventilación y refrigeración","pl":"Kalkulator kosztów wentylacji i chłodzenia"},"h":["cfd","luchtgroepselector","mollier","moodydiagram","ontvochtiging","operatingpoint","ventilation","verwarmenkoelenselector","wallthermalcalculator"]},
 "loadlist":{"f":"loadlist.html","t":{"en":"Electrical load list","uk":"Перелік електричних навантажень","de":"Elektrische Lastenliste","nl":"Elektrische belastingslijst","fr":"Bilan de puissance électrique","es":"Listado de cargas eléctricas","pl":"Lista odbiorów elektrycznych"},"h":["cablesizing","protectioncoordination","shortcircuit"],"p":["equipmentdatasheet","projectworkspace"],"l":["electricalnetwork"]},
 "luchtbalans":{"f":"luchtbalans.html","t":{"en":"Air Balance & Pressure Cascade","uk":"Повітряний баланс і каскад тиску","de":"Luftbilanz & Druckkaskade","nl":"Luchtbalans & drukcascade","fr":"Bilan d’air & cascade de pression","es":"Balance de aire y cascada de presión","pl":"Bilans powietrza i kaskada ciśnień"},"h":["luchtgroepselector","mollier","moodydiagram","operatingpoint"]},
 "luchtgroepselector":{"f":"luchtgroepselector.html","t":{"en":"Air Handling Unit Specification Aid","uk":"Помічник із завдання на припливно-витяжну установку","de":"Auslegungshilfe Lüftungsgerät (RLT)","nl":"Uitvraag luchtgroep — selectiehulp","fr":"Aide au cahier des charges d’une centrale de traitement d’air","es":"Guía de especificación de climatizadores (UTA)","pl":"Pomoc w specyfikacji centrali wentylacyjnej"},"h":["cfd","klimaatcalculator","mollier","moodydiagram","ontvochtiging","operatingpoint","ventilation","verwarmenkoelenselector","wallthermalcalculator"],"p":["equipmentdatasheet","loadlist"]},
 "maintenance-test-interval-change":{"f":"maintenance_test_interval_change.html","t":{"en":"Maintenance & Test Interval Change","uk":"Зміна інтервалу техобслуговування й випробувань","de":"Änderung von Wartungs- und Prüfintervallen","nl":"Wijziging onderhouds- en testinterval","fr":"Modification des intervalles de maintenance et d’essai","es":"Cambio de intervalos de mantenimiento y prueba","pl":"Zmiana interwału obsługi i prób"},"p":["designbasisintegritylto"],"l":["changeimpact","postmodificationverification"]},
 "mollier":{"f":"mollier.html","t":{"en":"Mollier i–d / Psychrometric Chart","uk":"Діаграма Молльє i–d / психрометрична","de":"Mollier-i–d- / psychrometrisches Diagramm","nl":"Mollier i–d / psychrometrisch diagram","fr":"Diagramme de Mollier i–d / psychrométrique","es":"Diagrama de Mollier i–d / psicrométrico","pl":"Mollier i–d / Wykres psychrometryczny"},"h":["cfd","ductnetwork","klimaatcalculator","luchtgroepselector","moodydiagram","ontvochtiging","operatingpoint","wallthermalcalculator"]},
 "moodydiagram":{"f":"moodydiagram.html","t":{"en":"Moody Diagram & Pipe Friction","uk":"Діаграма Муді та тертя в трубах","de":"Moody-Diagramm & Rohrreibung","nl":"Moody-diagram & leidingwrijving","fr":"Diagramme de Moody & frottement en conduite","es":"Diagrama de Moody y fricción en tuberías","pl":"Diagram Moody'ego i tarcie rurowe"},"h":["ductnetwork","gasline-packing","heat-exchangers","hydraulicnetwork","luchtgroepselector","mollier","operatingpoint","pipe-filling-draining","relief-valve-sizing","steam-pipe-pressure-loss","steam-tables","vessel-blowdown","waterhammer"]},
 "neutron-transport":{"f":"neutron_transport.html","t":{"en":"Neutron Transport (2-D Monte Carlo)","uk":"Перенесення нейтронів (2-D Монте-Карло)","de":"Neutronentransport (2-D-Monte-Carlo)","nl":"Neutronentransport (2D-montecarlo)","fr":"Transport de neutrons (Monte-Carlo 2-D)","es":"Transporte de neutrones (Monte Carlo 2-D)","pl":"Transport neutronów (2-D Monte Carlo)"},"h":["corescoping"]},
 "obsolescenceltb":{"f":"obsolescenceltb.html","t":{"en":"Obsolescence & Last-Time-Buy","uk":"Застарівання та остання закупівля","de":"Obsoleszenz & Last-Time-Buy","nl":"Obsolescentie & Last-Time-Buy","fr":"Obsolescence et dernier achat","es":"Obsolescencia y última compra","pl":"Starzenie technologiczne i ostatni zakup"},"l":["changeimpact","equivalence","repairreplace"]},
 "ontvochtiging":{"f":"ontvochtiging.html","t":{"en":"Dehumidification Method Selector","uk":"Селектор методу осушення повітря","de":"Auswahlwerkzeug für Entfeuchtungsverfahren","nl":"Keuzehulp ontvochtigingsmethode","fr":"Sélecteur de méthode de déshumidification","es":"Selector de método de deshumidificación","pl":"Selektor metody osuszania"},"h":["cfd","klimaatcalculator","luchtgroepselector","mollier","moodydiagram","operatingpoint","wallthermalcalculator"]},
 "operatingenvelope":{"f":"operatingenvelope.html","t":{"en":"Operating Envelope Change & Margin Consumer","uk":"Зміна робочої області та контроль запасів","de":"Betriebsbereichsänderung und Margenprüfung","nl":"Wijziging bedrijfsgebied en marges","fr":"Modification du domaine de fonctionnement et marges","es":"Cambio de envolvente operativa y márgenes","pl":"Zmiana obwiedni eksploatacyjnej i kontrola marginesów"},"p":["designbasisintegritylto"],"l":["cablesizing","changeimpact","cyclingfatiguelife","degradationlifeprojector","h2-co2-pipeline-repurposing","maintenance-test-interval-change","moodydiagram","operatingpoint","protectioncoordination","shortcircuit","wallthinning"]},
 "operatingpoint":{"f":"operatingpoint.html","t":{"en":"Pump & Fan Operating Point","uk":"Робоча точка насоса та вентилятора","de":"Betriebspunkt von Pumpe und Ventilator","nl":"Werkpunt van pomp en ventilator","fr":"Point de fonctionnement pompe et ventilateur","es":"Punto de operación de bomba y ventilador","pl":"Punkt pracy pompy i wentylatora"},"h":["heat-exchangers","luchtgroepselector","mollier","moodydiagram","pipe-filling-draining","steam-tables","waterhammer"],"p":["equipmentdatasheet","loadlist"]},
 "packagereadiness":{"f":"packagereadiness.html","t":{"en":"Package Readiness","uk":"Готовність пакетів обладнання","de":"Reifegrad von Paketen","nl":"Gereedheid van pakketten","fr":"État de préparation des lots","es":"Madurez de paquetes","pl":"Gotowość pakietów"},"p":["projectworkspace"],"l":["commissioningturnover","deviationregister"]},
 "permitworkstudio":{"f":"permitworkstudio.html","t":{"en":"Permit-to-Work Studio","uk":"Студія дозволів на роботи","de":"Arbeitsfreigabe-Studio","nl":"Werkvergunningstudio","fr":"Atelier de permis de travail","es":"Estudio de permisos de trabajo","pl":"Studio zezwoleń na pracę"},"l":["isolationplanner"]},
 "pipe-filling-draining":{"f":"pipe_filling_draining.html","t":{"en":"Pipe Filling / Draining","uk":"Заповнення / спорожнення трубопроводу","de":"Rohrfüllung / -entleerung","nl":"Leiding vullen / ledigen","fr":"Remplissage / vidange de conduite","es":"Llenado / vaciado de tubería","pl":"Napełnianie / opróżnianie rurociągu"},"h":["flashing-valve-orifice","gasline-packing","hydraulicnetwork","moodydiagram","operatingpoint","relief-valve-sizing","steam-pipe-pressure-loss","two-phase-critical-flow","vessel-blowdown","waterhammer"]},
 "probabilisticrisk":{"f":"probabilisticrisk.html","t":{"en":"Probabilistic Risk Explorer","uk":"Дослідник імовірнісного ризику","de":"Probabilistischer Risiko-Explorer","nl":"Probabilistische risicoverkenner","fr":"Explorateur de risque probabiliste","es":"Explorador de riesgo probabilista","pl":"Eksplorator probabilistycznej analizy ryzyka (PSA)"},"l":["safetyimprovement"]},
 "projectdefinition":{"f":"projectdefinition.html","t":{"en":"Project Definition & Design Basis Builder","uk":"Визначення проєкту та вихідних даних","de":"Projektdefinition & Auslegungsgrundlage","nl":"Projectdefinitie & ontwerpgrondslag","fr":"Définition du projet et base de conception","es":"Definición del proyecto y base de diseño","pl":"Definicja projektu i podstawa projektowa"},"p":["bidevaluation","causeeffect","changeimpact","commissioningturnover","deliverablesplanner","designreview","deviationregister","equipmentdatasheet","functionaldescription","functionaltest","interfacebuilder","iolist","loadlist","packagereadiness","projectworkspace","requirementsmatrix","technicalrequisition","vendordocuments"]},
 "projectworkspace":{"f":"projectworkspace.html","t":{"en":"Project Workspace","uk":"Робоча область проєкту","de":"Projekt-Arbeitsbereich","nl":"Projectwerkruimte","fr":"Espace de travail du projet","es":"Espacio de trabajo del proyecto","pl":"Przestrzeń robocza projektu"},"l":["projectdefinition"]},
 "protectioncoordination":{"f":"protectioncoordination.html","t":{"en":"Protection Coordination Studio","uk":"Студія координації захистів","de":"Studio für Schutzkoordination","nl":"Studio voor beveiligingscoördinatie","fr":"Studio de coordination des protections","es":"Estudio de coordinación de protecciones","pl":"Studio koordynacji zabezpieczeń"},"h":["cablesizing","shortcircuit"]},
 "reactorstand":{"f":"reactorstand.html","t":{"en":"Reactor Live Stand","uk":"Живий стенд реактора","de":"Reaktor-Live-Prüfstand","nl":"Live-opstelling reactor","fr":"Banc de réacteur en temps réel","es":"Banco de reactor en tiempo real","pl":"Stanowisko badawcze reaktora"},"h":["corescoping","kinetics","neutron-transport"]},
 "regelkring":{"f":"regelkring.html","t":{"en":"Control Loop Laboratory","uk":"Лабораторія контуру регулювання","de":"Regelkreis-Labor","nl":"Regelkringlaboratorium","fr":"Laboratoire de boucle de régulation","es":"Laboratorio de lazo de control","pl":"Laboratorium układów regulacji"},"h":["kinetics"]},
 "relief-valve-sizing":{"f":"relief_valve_sizing.html","t":{"en":"Relief Valve Sizing — Preliminary","uk":"Попередній підбір запобіжного клапана","de":"Vorbemessung Sicherheitsventil","nl":"Voorselectie veiligheidsklep","fr":"Pré-dimensionnement soupape","es":"Predimensionado válvula de alivio","pl":"Wstępny dobór zaworu bezpieczeństwa"},"h":["flashing-valve-orifice","gasline-packing","heat-exchangers","steam-pipe-pressure-loss","tank-pressurisation","two-phase-critical-flow","vessel-blowdown"]},
 "repairreplace":{"f":"repairreplace.html","t":{"en":"Repair / Refurbish / Replace / Upgrade","uk":"Ремонт / капремонт / заміна / модернізація","de":"Reparieren / Überholen / Ersetzen / Ertüchtigen","nl":"Repareren / reviseren / vervangen / upgraden","fr":"Réparer / rénover / remplacer / moderniser","es":"Reparar / reacondicionar / sustituir / modernizar","pl":"Naprawa / remont kapitalny / wymiana / modernizacja"},"l":["changeimpact","tieinoutageplanner"]},
 "requirementsmatrix":{"f":"requirementsmatrix.html","t":{"en":"Requirements & Verification Matrix","uk":"Матриця вимог і верифікації","de":"Anforderungs- und Verifikationsmatrix","nl":"Eisen- en verificatiematrix","fr":"Matrice exigences et vérification","es":"Matriz de requisitos y verificación","pl":"Macierz wymagań i weryfikacji"},"p":["bidevaluation","changeimpact","commissioningturnover","deliverablesplanner","designreview","deviationregister","equipmentdatasheet","packagereadiness","projectworkspace","technicalrequisition"]},
 "rpv-embrittlement-pts":{"f":"rpv_embrittlement_pts.html","t":{"en":"RPV Embrittlement & PTS Screening","uk":"Окрихчення RPV та PTS-скринінг","de":"RPV-Versprödung & PTS-Screening","nl":"RPV-verbrossing & PTS-screening","fr":"Fragilisation de la cuve & criblage PTS","es":"Fragilización de RPV y cribado PTS","pl":"Kruchość RPV i screening PTS"},"l":["designbasisintegritylto"]},
 "rwa-calculator":{"f":"RWA_calculator.html","t":{"en":"Smoke & Heat Exhaust (RWA / SHEV)","uk":"Димо- та тепловидалення (RWA / SHEV)","de":"Rauch- und Wärmeabzug (RWA)","nl":"Rook- en warmteafvoer (RWA)","fr":"Évacuation des fumées et de la chaleur (EFC)","es":"Evacuación de humos y calor (SHEV)","pl":"Oddymianie i odprowadzanie ciepła (RWA / SHEV)"},"h":["operatingpoint"]},
 "safetyimprovement":{"f":"safetyimprovement.html","t":{"en":"Safety Improvement Prioritiser","uk":"Пріоритизатор поліпшень безпеки","de":"Priorisierung von Sicherheitsverbesserungen","nl":"Prioritering van veiligheidsverbeteringen","fr":"Priorisation des améliorations de sûreté","es":"Priorizador de mejoras de seguridad","pl":"Priorytetyzacja ulepszeń bezpieczeństwa"},"l":["changeimpact"]},
 "shortcircuit":{"f":"shortcircuit.html","t":{"en":"IEC 60909 Short-Circuit","uk":"IEC 60909 Short-Circuit","de":"IEC 60909 Short-Circuit","nl":"IEC 60909 Short-Circuit","fr":"IEC 60909 Short-Circuit","es":"IEC 60909 Short-Circuit","pl":"IEC 60909 Short-Circuit"},"h":["cablesizing","protectioncoordination"]},
 "solargaincalculator":{"f":"solargaincalculator.html","t":{"en":"Solar Gain & PV Yield","uk":"Сонячне тепло та виробіток PV","de":"Solarwärmeeintrag & PV-Ertrag","nl":"Zonnewarmte & PV-opbrengst","fr":"Apports solaires & productible PV","es":"Ganancia solar y producción FV","pl":"Zysk słoneczny i uzysk fotowoltaiczny"},"h":["klimaatcalculator","ventilation","verwarmenkoelenselector","wallthermalcalculator"]},
 "spectrum":{"f":"spectrum.html","t":{"en":"Neutron Flux Spectrum","uk":"Спектр нейтронного потоку","de":"Neutronenfluss-Spektrum","nl":"Neutronenfluxspectrum","fr":"Spectre du flux neutronique","es":"Espectro del flujo neutrónico","pl":"Widmo strumienia neutronów"},"h":["doppler"]},
 "steam-pipe-pressure-loss":{"f":"steam_pipe_pressure_loss.html","t":{"en":"Steam Pipe Pressure Loss","uk":"Втрати тиску в паропроводі","de":"Druckverlust in Dampfleitungen","nl":"Drukverlies in stoomleidingen","fr":"Perte de charge en conduite vapeur","es":"Pérdida de presión en tubería de vapor","pl":"Spadek ciśnienia w rurociągu pary"},"h":["flashing-valve-orifice","heat-exchangers","operatingpoint","relief-valve-sizing","tank-pressurisation","two-phase-critical-flow","vessel-blowdown"]},
 "steam-tables":{"f":"steam_tables.html","t":{"en":"Steam Tables (IAPWS-IF97)","uk":"Таблиці водяної пари (IAPWS-IF97)","de":"Wasserdampftafeln (IAPWS-IF97)","nl":"Stoomtabellen (IAPWS-IF97)","fr":"Tables de vapeur d’eau (IAPWS-IF97)","es":"Tablas de vapor de agua (IAPWS-IF97)","pl":"Tablice parowe (IAPWS-IF97)"},"h":["heat-exchangers","hydraulicnetwork","moodydiagram","operatingpoint","pipe-filling-draining","relief-valve-sizing","waterhammer"]},
 "tank-pressurisation":{"f":"tank_pressurisation.html","t":{"en":"Tank Pressurisation","uk":"Наддув резервуара","de":"Behälterdruckaufbau","nl":"Tankdrukopbouw","fr":"Pressurisation d’un réservoir","es":"Presurización de tanque","pl":"Sprężanie zbiornika"},"h":["flashing-valve-orifice","gasline-packing","heat-exchangers","relief-valve-sizing","two-phase-critical-flow","vessel-blowdown"],"p":["equipmentdatasheet"]},
 "technicalrequisition":{"f":"technicalrequisition.html","t":{"en":"Technical Requisition Builder","uk":"Конструктор технічної заявки на закупівлю","de":"Technische Bestell-Anforderung","nl":"Opsteller technische aanvraag","fr":"Générateur de réquisition technique","es":"Generador de requisición técnica","pl":"Kreator zapotrzebowania technicznego"},"p":["bidevaluation","packagereadiness","projectworkspace"],"l":["deviationregister","vendordocuments"]},
 "temporaryconfigurationbypassrisk":{"f":"temporaryconfigurationbypassrisk.html","t":{"en":"Temporary Configuration & Bypass Risk","uk":"Тимчасова конфігурація та ризик байпасу","de":"Temporäre Konfiguration & Bypass-Risiko","nl":"Tijdelijke configuratie & bypassrisico","fr":"Configuration temporaire & risque de bypass","es":"Configuración temporal y riesgo de bypass","pl":"Konfiguracja tymczasowa i ryzyko obejścia"},"p":["designbasisintegritylto"],"l":["maintenance-test-interval-change","postmodificationverification"]},
 "thermodynamiccycles":{"f":"thermodynamiccycles.html","t":{"en":"Thermodynamic Cycles","uk":"Термодинамічні цикли","de":"Thermodynamische Kreisprozesse","nl":"Thermodynamische kringprocessen","fr":"Cycles thermodynamiques","es":"Ciclos termodinámicos","pl":"Cykle termodynamiczne"},"h":["gasline-packing","heat-exchangers","moodydiagram","operatingpoint","relief-valve-sizing","steam-pipe-pressure-loss","steam-tables"]},
 "tieinoutageplanner":{"f":"tieinoutageplanner.html","t":{"en":"Tie-in & Outage Window Planner","uk":"Планувальник врізок і вікна зупинки","de":"Planer für Einbindungen und Stillstandsfenster","nl":"Planner voor tie-ins en stilstandsvenster","fr":"Planificateur de raccordements et fenêtre d’arrêt","es":"Planificador de tie-ins y ventana de parada","pl":"Planer włączeń i okna postoju"},"l":["postmodificationverification","temporaryconfigurationbypassrisk","variationtimeimpact"]},
 "two-phase-critical-flow":{"f":"two_phase_critical_flow.html","t":{"en":"Two-Phase Critical Flow","uk":"Двофазна критична витрата","de":"Kritische Zweiphasenströmung","nl":"Kritische tweefasenstroming","fr":"Écoulement critique diphasique","es":"Flujo crítico bifásico","pl":"Krytyczny przepływ dwufazowy"},"h":["flashing-valve-orifice","heat-exchangers","hydraulicnetwork","pipe-filling-draining","relief-valve-sizing","steam-tables","tank-pressurisation","vessel-blowdown","waterhammer"]},
 "vendordocuments":{"f":"vendordocuments.html","t":{"en":"Vendor Documentation Planner","uk":"Планувальник документації постачальника","de":"Planer für Lieferantendokumentation","nl":"Planner voor leveranciersdocumentatie","fr":"Planificateur de documentation fournisseur","es":"Planificador de documentación del proveedor","pl":"Planer dokumentacji dostawcy"},"p":["changeimpact","commissioningturnover","designreview","deviationregister","packagereadiness","projectworkspace","technicalrequisition"]},
 "ventilation":{"f":"ventilation.html","t":{"en":"Room Ventilation Calculator","uk":"Калькулятор вентиляції приміщення","de":"Raumlüftungsrechner","nl":"Ventilatiecalculator voor ruimten","fr":"Calculateur de ventilation de local","es":"Calculadora de ventilación de sala","pl":"Kalkulator wentylacji pomieszczenia"},"h":["cfd","klimaatcalculator","luchtgroepselector","mollier","moodydiagram","ontvochtiging","operatingpoint","verwarmenkoelenselector"]},
 "verwarmenkoelenselector":{"f":"verwarmenkoelenselector.html","t":{"en":"Heating & Cooling System Selector","uk":"Вибір системи опалення та охолодження","de":"Auswahlhilfe Heizen und Kühlen","nl":"Uitvraag verwarmen en koelen — systeemkeuze","fr":"Choix du système de chauffage et de refroidissement","es":"Selección del sistema de calefacción y refrigeración","pl":"Dobór systemu ogrzewania i chłodzenia"},"h":["klimaatcalculator","moodydiagram","operatingpoint","ventilation"],"p":["equipmentdatasheet"]},
 "vessel-blowdown":{"f":"vessel_blowdown.html","t":{"en":"Relief / Blowdown / Depressurisation","uk":"Скидання тиску / спорожнення посудини","de":"Entlastung / Blowdown / Druckabbau","nl":"Ontlasting / blowdown / drukafbouw","fr":"Décharge / blowdown / dépressurisation","es":"Alivio / blowdown / despresurización","pl":"Upust / blowdown / rozprężanie zbiornika"},"h":["flashing-valve-orifice","gasline-packing","heat-exchangers","relief-valve-sizing","tank-pressurisation","two-phase-critical-flow"]},
 "wallthinning":{"f":"wallthinning.html","t":{"en":"Wall Thinning Trender","uk":"Тренд утонення стінки","de":"Wanddicken-Trendanalyse","nl":"Wanddikte-trendanalyse","fr":"Tendance d’amincissement de paroi","es":"Tendencia de adelgazamiento de pared","pl":"Analiza trendu ścienienia ścianki"},"p":["designbasisintegritylto"],"l":["maintenance-test-interval-change","repairreplace"]},
 "waterhammer":{"f":"waterhammer.html","t":{"en":"Water Hammer Transient Sandbox","uk":"Перехідні процеси гідроудару","de":"Druckstoß-Transientensandbox","nl":"Waterslag-transiëntsandbox","fr":"Banc d’essai transitoire de coup de bélier","es":"Banco transitorio de golpe de ariete","pl":"Laboratorium uderzenia hydraulicznego i stanów przejściowych"},"h":["flashing-valve-orifice","gasline-packing","hydraulicnetwork","moodydiagram","operatingpoint","pipe-filling-draining","relief-valve-sizing","steam-pipe-pressure-loss","two-phase-critical-flow","vessel-blowdown"]},
 "workatheight":{"f":"workatheight.html","t":{"en":"Work-at-Height Lab","uk":"Лабораторія робіт на висоті","de":"Labor Arbeiten in der Höhe","nl":"Lab werken op hoogte","fr":"Laboratoire du travail en hauteur","es":"Laboratorio de trabajos en altura","pl":"Laboratorium pracy na wysokości"},"l":["permitworkstudio"]},
 "xenon":{"f":"xenon.html","t":{"en":"Xenon-135 Transient","uk":"Перехідний процес ксенону-135","de":"Xenon-135-Transiente","nl":"Xenon-135-transiënt","fr":"Transitoire du xénon-135","es":"Transitorio del xenón-135","pl":"Przebieg ksenonu-135"},"h":["kinetics"]}
};
/* the project runtime this engine lazy-loads for "Attach to project" (same
   origin, its own cache anchor, AGENTS §6.2) */
const PROJECT_RUNTIME="diagram-project.js?v=7ce739385604";
/* WF-SNAPSHOT:END */
const PKG_SCHEMA="tools.petrov.re/project-package/v1";
const PKG_KEY_DOC="diagram_project_package",PKG_KEY_META="diagram_project_package_meta";

/* §6.2: the meta header is the only thing read at boot. */
function pkgMeta(){
 try{
  const raw=localStorage.getItem(PKG_KEY_META);if(!raw)return null;
  const m=JSON.parse(raw);
  return(m&&typeof m==="object"&&m.package_id)?m:null;
 }catch(e){return null}
}
/* The whole document, parsed only on a user action (the attach dialog). */
function pkgDoc(){
 try{
  const raw=localStorage.getItem(PKG_KEY_DOC);if(!raw)return null;
  const d=JSON.parse(raw);
  return(d&&typeof d==="object"&&!Array.isArray(d)&&d.schema===PKG_SCHEMA)?d:null;
 }catch(e){return null}
}
function wfManifest(){const m=manifest();const w=m&&m.workflow;return(w&&typeof w==="object"&&!Array.isArray(w))?w:null}
/* Next tools known without the network: the page's own manifest wins, as in
   catalog.php; otherwise the embedded snapshot of workflow-map.json. */
function wfOwnOutputs(){
 const w=wfManifest();
 if(w&&Array.isArray(w.outputsTo))return w.outputsTo.filter(x=>typeof x==="string"&&x&&x!==toolId()&&wfOffered(w,x));
 return wfSnapEdges(toolId()).map(e=>e[0]);
}
/* §5.1: the map says which edges the toolbar offers; an edge with no flag is
   offered. Nothing is dropped from the graph -- the refused ones are still
   published by catalog.php for projectworkspace and workflow-map.md. */
function wfOffered(w,id){
 const o=w&&w.offer;
 return !(o&&typeof o==="object"&&o[id]===false);
}
/* §5.1 W-3: package edges first, then handoff by the number of shared
   quantities, then by title in the page language. */
function wfOrder(l){
 return (a,b)=>{
  const r=t=>t.carries==="package"?0:1;
  if(r(a)!==r(b))return r(a)-r(b);
  const ca=(a.common||[]).length,cb=(b.common||[]).length;
  if(ca!==cb)return cb-ca;
  try{return String(a.title).localeCompare(String(b.title),l)}catch(e){return String(a.title)<String(b.title)?-1:1}
 };
}
/* §5.1 W-4: a toolbar list a person reads, not the whole graph. */
const WF_MAX=6;
/* snapshot node -> [[id, carries], ...] in handoff, package, link order */
function wfSnapEdges(id){
 const s=WF_SNAPSHOT[id]||{},out=[];
 [["h","handoff"],["p","package"],["l","link"]].forEach(k=>{
  if(Array.isArray(s[k[0]]))s[k[0]].forEach(t=>{if(typeof t==="string"&&t)out.push([t,k[1]])})});
 return out;
}
/* null while no catalogue has been read; then the number of next tools the
   catalogue publishes for this page. The button follows this figure when it
   exists and the offline sources only until then. */
let WF_EDGES=null;
function wfOutCount(){return WF_EDGES===null?wfOwnOutputs().length:WF_EDGES}
function wfCatalogEdges(c){
 /* a catalogue from before v4.15 carries no workflow: leave the snapshot in charge */
 if(!c||!Array.isArray(c.tools)||!Array.isArray(c.workflow_stages))return null;
 const me=toolId(),by={};c.tools.forEach(t=>{if(t&&t.id)by[t.id]=t});
 const w=(by[me]&&by[me].workflow)||null;
 if(!w||!Array.isArray(w.outputsTo))return 0;
 return w.outputsTo.filter(id=>by[id]&&wfOffered(w,id)).length;
}
function wfSetEdges(n){
 if(typeof n!=="number"||WF_EDGES===n)return;
 const had=wfOutCount()>0;
 WF_EDGES=n;
 if(had!==(n>0)){try{buildBar()}catch(e){warn(e)}}
}
function wfProvides(){return(manifest()&&manifest().handoff&&manifest().handoff.provides)||(CFG.handoff&&CFG.handoff.provides)||[]}
/* -> {targets:[{id,file,title,carries,why,common}], offline, snapshot_date} */
function wfTargets(){
 const l=currentLang(),me=toolId(),prov=wfProvides();
 const inter=a=>(Array.isArray(a)?a:[]).filter(q=>prov.indexOf(q)>=0);
 const snap=()=>{
  const w=wfManifest();
  const own=!!(w&&Array.isArray(w.outputsTo));
  const ids=wfOwnOutputs(),carries={};
  if(own)Object.assign(carries,w.carries||{});else wfSnapEdges(me).forEach(e=>{carries[e[0]]=e[1]});
  const acc={};
  (embeddedCatalog()||SNAPSHOT).forEach(t=>{if(t&&t.f)acc[t.f]=t.a});
  const targets=ids.map(id=>{
   const e=WF_SNAPSHOT[id];if(!e||!e.f)return null;
   return{id:id,file:e.f,title:pick(e.t,l)||e.f,carries:carries[id]||"link",
    why:own&&w.why?pick(w.why[id]||"",l):"",common:inter(acc[e.f])};
  }).filter(Boolean).sort(wfOrder(l));
  return{targets:targets,offline:true,snapshot_date:WF_SNAPSHOT_DATE||"—"};
 };
 return catalogFetch().then(c=>{
  /* a catalogue from before v4.15 carries no workflow at all: say snapshot */
  if(!c||!Array.isArray(c.tools)||!Array.isArray(c.workflow_stages))return snap();
  const by={};c.tools.forEach(t=>{if(t&&t.id)by[t.id]=t});
  const w=(by[me]&&by[me].workflow)||null;
  if(!w||!Array.isArray(w.outputsTo))return{targets:[],offline:false};
  const carries=w.carries||{},why=w.why||{};
  const targets=w.outputsTo.filter(id=>wfOffered(w,id)).map(id=>by[id]).filter(Boolean).map(t=>({id:t.id,file:t.file,
   title:pick(t.title,l)||t.file,carries:carries[t.id]||"link",why:pick(why[t.id]||"",l),
   common:inter(t.handoff&&t.handoff.accepts)})).sort(wfOrder(l));
  return{targets:targets,offline:false};
 }).catch(()=>snap());
}
function wfCanHandoff(t){
 return t.carries==="handoff"&&t.common.length>0&&!!(CFG.handoff&&typeof CFG.handoff.build==="function");
}
/* §6.1: handoff where it is declared and the quantities meet, else a plain link;
   either way the target opens beside this tool and carries ?lang=. */
function wfOpen(t){
 if(wfCanHandoff(t)){handoffSend(t.file);return}
 const u=t.file+"?lang="+encodeURIComponent(currentLang());
 try{window.open(u,"_blank","noopener")}catch(e){location.href=u}
}
function wfMenu(){
 const l=currentLang();
 if(!wfHasRecord()){notify(tr("noRecord",l),"err");return}
 wfTargets().then(r=>{
  const note=r.offline?tr("wfSnapshot",l).replace("%s",r.snapshot_date||"—"):"";
  const item=t=>{
   const how=wfCanHandoff(t)?tr("wfHandoff",l).replace("%s",t.common.join(", "))
    :t.carries==="package"?tr("wfPackage",l):tr("wfLink",l);
   /* a handoff edge's why already names its quantities (contract §5) */
   const sub=t.why?(t.why+(wfCanHandoff(t)?"":" — "+how)):how;
   return{label:t.title,sub:sub,on:()=>wfOpen(t)};
  };
  const hidden=r.targets.length-WF_MAX;
  const show=all=>{
   const items=(all?r.targets:r.targets.slice(0,WF_MAX)).map(item);
   if(!all&&hidden>0)items.push({label:tr("wfMore",l).replace("%n",String(hidden)),sub:"",on:()=>show(true)});
   const m=menu(items,tr("wfNone",l),note);
   /* a long list scrolls inside the menu instead of leaving the viewport */
   try{m.style.maxHeight="calc(100vh - "+(window.innerWidth<=640?124:78)+"px)";m.style.overflowY="auto"}catch(e){}
  };
  show(false);
 }).catch(e=>warn(e));
}

/* ---- record-dependent visibility ----
   "Continue with" and "Attach" appear once record() returns non-null (§6.1,
   §6.3). The bar is built once, so the check re-runs, debounced, after the
   user's own input and after the readiness gates; nothing is wired on a page
   that shows neither button. */
let WF_BTN={cont:null,att:null},WF_WIRED=false,WF_TIMER=0;
/* A tool whose record() takes longer than 50 ms is not polled again: its
   buttons stay visible and the click itself checks for a record. */
let WF_SLOW=false;
function wfHasRecord(){
 if(!CFG.record||typeof CFG.record!=="function")return false;
 const now=()=>(window.performance&&performance.now)?performance.now():Date.now();
 const t0=now();let r=null;
 try{r=CFG.record()}catch(e){r=null}
 if(now()-t0>50)WF_SLOW=true;
 return !!r;
}
function wfRefresh(){
 try{
  const b=WF_BTN;if(!b.cont&&!b.att)return;
  const has=WF_SLOW||wfHasRecord();
  if(b.cont)b.cont.hidden=!has;
  if(b.att)b.att.hidden=!(has&&pkgMeta());
 }catch(e){warn(e)}
}
function wfSoon(){try{if(WF_TIMER)clearTimeout(WF_TIMER);WF_TIMER=setTimeout(()=>{WF_TIMER=0;wfRefresh()},600)}catch(e){}}
function wfWire(){
 if(WF_WIRED)return;WF_WIRED=true;
 try{
  ["input","change","click","keyup"].forEach(ev=>document.addEventListener(ev,wfSoon,true));
  /* another tab wrote or cleared the package: rebuild chip and buttons */
  window.addEventListener("storage",e=>{
   if(!e||e.key===null||e.key===PKG_KEY_META||e.key===PKG_KEY_DOC){try{buildBar()}catch(x){warn(x)}}
  });
  whenReady().then(wfRefresh,()=>{});
  /* a first result that arrives without a gate and without a user event */
  [500,1000,1500,2500,4000,7000,10000].forEach(ms=>setTimeout(()=>{if(!WF_SLOW)wfRefresh()},ms));
 }catch(e){warn(e)}
}
function wfStyles(){
 if(document.getElementById("dgc-wf-style"))return;
 const s=document.createElement("style");s.id="dgc-wf-style";s.textContent=`
 #dgc-bar [hidden]{display:none!important}
 #dgc-bar .dgc-proj{font:600 11px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px dashed #7d93b5;background:#f4f7fb;color:#1d3f7a;border-radius:999px;padding:6px 10px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,.08)}
 #dgc-bar .dgc-wf{border-color:#7d93b5;color:#1d3f7a}
 #dgc-pj{position:fixed;inset:0;z-index:2147483200;background:rgba(15,23,34,.42);display:flex;align-items:center;justify-content:center;padding:16px;font:400 13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 #dgc-pj form{background:#fff;color:#1d2733;border:1px solid #c9d2dd;border-radius:14px;box-shadow:0 16px 48px rgba(0,0,0,.3);padding:16px 18px;width:min(460px,100%);max-height:calc(100vh - 32px);overflow:auto;box-sizing:border-box}
 #dgc-pj h2{font:700 15px/1.3 inherit;margin:0 0 4px}
 #dgc-pj .dgc-pj-sub{color:#5c6675;font-size:12px;margin:0 0 12px}
 #dgc-pj label{display:block;font-weight:600;font-size:12px;margin:10px 0 4px}
 #dgc-pj select,#dgc-pj input{width:100%;box-sizing:border-box;font:inherit;padding:7px 8px;border:1px solid #c9d2dd;border-radius:8px;background:#fff;color:inherit}
 #dgc-pj .dgc-pj-row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
 #dgc-pj button{font:600 12px/1.2 inherit;border:1px solid #c9d2dd;background:#fff;color:#1d2733;border-radius:999px;padding:8px 14px;cursor:pointer}
 #dgc-pj button.dgc-pj-go{background:#1d3f7a;border-color:#1d3f7a;color:#fff}
 @media(prefers-color-scheme:dark){
  #dgc-bar .dgc-proj{background:#182230;color:#b9cdf0;border-color:#4a5d7a}
  #dgc-bar .dgc-wf{color:#b9cdf0;border-color:#4a5d7a}
  #dgc-pj form{background:#161b22;color:#e6edf3;border-color:#30363d}
  #dgc-pj .dgc-pj-sub{color:#8b98a8}
  #dgc-pj select,#dgc-pj input,#dgc-pj button{background:#0d1117;color:#e6edf3;border-color:#30363d}
  #dgc-pj button.dgc-pj-go{background:#2f5fb5;border-color:#2f5fb5;color:#fff}}
 @media print{#dgc-pj{display:none!important}}
 `;
 (document.head||document.documentElement).appendChild(s);
}
/* §6.2 project chip, right after the status badge */
function pjChip(bar,l){
 const m=pkgMeta();if(!m)return;
 wfStyles();
 const name=String(m.project||"").trim()||tr("pjUnnamed",l);
 const rev=String(Number(m.revision)||0);
 const c=document.createElement("span");c.className="dgc-proj";
 c.textContent=tr("pjChip",l).replace("%p",name).replace("%r",rev);
 c.title=tr("pjChipTitle",l).replace("%p",name).replace("%r",rev).replace("%u",String(m.updated_at||"—"));
 bar.appendChild(c);
}
/* §6.1 + §6.3 buttons, hidden until the record exists */
function wfButtons(bar,l){
 WF_BTN={cont:null,att:null};
 if(!CFG.record)return;
 const outs=wfOutCount(),meta=pkgMeta();
 if(!outs&&!meta)return;
 wfStyles();
 /* data-dgc-act names the action for the site counter, which lives at the end
    of diagram-ui.js and reads the shared bar through the capture click
    listener it already installs. The attribute is the action name only; no
    value, no target and no project name leaves the page (AGENTS §10). */
 const mk=(label,on,act)=>{const b=document.createElement("button");b.type="button";b.className="dgc-wf";
  b.setAttribute("data-dgc-act",act);
  b.textContent=label;b.hidden=true;b.addEventListener("click",safe(on,null));bar.appendChild(b);return b};
 if(outs)WF_BTN.cont=mk(tr("wfContinue",l),wfMenu,"continue");
 if(meta)WF_BTN.att=mk(tr("pjAttach",l),pjAttach,"attach");
 wfWire();
 wfRefresh();
}

/* ---- attach (§6.3) ---- */
let PJ_LOAD=null;
function projectRuntime(){
 if(window.DiagramProject)return Promise.resolve(window.DiagramProject);
 if(PJ_LOAD)return PJ_LOAD;
 PJ_LOAD=new Promise(res=>{
  try{
   const s=document.createElement("script");s.src=PROJECT_RUNTIME;s.async=true;
   s.onload=()=>res(window.DiagramProject||null);
   s.onerror=()=>{PJ_LOAD=null;res(null)};
   (document.head||document.documentElement).appendChild(s);
  }catch(e){warn(e);PJ_LOAD=null;res(null)}
 });
 return PJ_LOAD;
}
function pjFail(reason,l){notify(tr("pjFail",l).replace("%s",reason),"err")}
/* TZ-project-package §4: a tool that hits a quota error tells the user and offers
   the file export. attachCalculation() reports ok with stored:false in that state
   and hands back the bytes it could not store, so the offer carries the entry that
   was just attached, not the stale document still in storage. */
function pjUnstored(res,entry,l){
 const reason=String((res&&res.reason)||"");
 const why=reason==="quota"?tr("pjQuotaWhy",l):reason==="storage"?tr("pjStoreWhy",l):(reason||"?");
 const n=notify(tr("pjUnstored",l)
   .replace("%i",String((res&&res.id)||entry.id||"?"))
   .replace("%r",String((res&&res.package_revision)||"?"))
   .replace("%s",why),"err");
 const text=String((res&&res.text)||"");
 if(!n||!text)return;
 try{
  const b=document.createElement("button");b.type="button";
  b.style.cssText="display:inline-block;margin-top:9px;font:600 12px/1.2 inherit;border:1px solid currentColor;background:transparent;color:inherit;border-radius:999px;padding:6px 12px;cursor:pointer";
  b.textContent=tr("pjSaveFile",l);
  b.addEventListener("click",()=>{
   let name="project.petrov.json";
   try{const DP=window.DiagramProject;if(DP&&typeof DP.fileName==="function")name=DP.fileName()||name}catch(e){warn(e)}
   download(name,"application/json",text);
  });
  n.appendChild(b);
 }catch(e){warn(e)}
}
function pjAttach(){
 const l=currentLang();
 const rec=recordBuild();
 if(!rec){notify(tr("noRecord",l),"err");return}
 const doc=pkgDoc();
 if(!doc){pjFail(tr("pjGone",l),l);try{buildBar()}catch(e){}return}
 pjDialog(doc,rec,l);
}
function pjArr(x){return Array.isArray(x)?x.filter(o=>o&&typeof o==="object"):[]}
function pjDialog(doc,rec,l){
 wfStyles();
 const old=document.getElementById("dgc-pj");if(old)old.remove();
 const id=toolId();
 const st=(doc.structure&&typeof doc.structure==="object")?doc.structure:{};
 const systems=pjArr(st.systems).filter(s=>s.id),packages=pjArr(st.packages).filter(p=>p.id);
 const calcs=(doc.calculations&&typeof doc.calculations==="object"&&!Array.isArray(doc.calculations))?pjArr(doc.calculations[id]).filter(c=>c.id):[];
 const tags=[];
 pjArr(doc.equipment_datasheets).forEach(d=>{if(d.tag&&tags.indexOf(String(d.tag))<0)tags.push(String(d.tag))});
 if(doc.calculations&&typeof doc.calculations==="object")Object.keys(doc.calculations).forEach(k=>
  pjArr(doc.calculations[k]).forEach(c=>{if(c.tag&&tags.indexOf(String(c.tag))<0)tags.push(String(c.tag))}));
 const opt=(v,t)=>'<option value="'+esc(v)+'">'+esc(t)+"</option>";
 const lbl=(o,alt)=>String(o.id)+(o.name||alt?" — "+(o.name||alt):"");
 const project=String((doc.project&&doc.project.name)||"").trim()||tr("pjUnnamed",l);
 const ov=document.createElement("div");ov.id="dgc-pj";
 ov.innerHTML='<form role="dialog" aria-modal="true" aria-labelledby="dgc-pj-h">'
  +'<h2 id="dgc-pj-h">'+esc(tr("pjHead",l))+"</h2>"
  +'<p class="dgc-pj-sub">'+esc(tr("pjChip",l).replace("%p",project).replace("%r",String(Number(doc.package_revision)||0)))+"<br>"
  +esc(tr("pjWhere",l).replace("%t",id))+"</p>"
  +(systems.length||packages.length?"":'<p class="dgc-pj-sub">'+esc(tr("pjNoStructure",l))+"</p>")
  +(calcs.length?'<label for="dgc-pj-e">'+esc(tr("pjEntry",l))+'</label><select id="dgc-pj-e">'+opt("",tr("pjNewEntry",l))
    +calcs.map(c=>opt(c.id,tr("pjReplace",l).replace("%s",c.id+(c.title?" — "+c.title:"")))).join("")+"</select>":"")
  +(systems.length?'<label for="dgc-pj-s">'+esc(tr("pjSystem",l))+'</label><select id="dgc-pj-s">'+opt("",tr("pjNone",l))
    +systems.map(s=>opt(s.id,lbl(s))).join("")+"</select>":"")
  +(packages.length?'<label for="dgc-pj-p">'+esc(tr("pjPackage",l))+'</label><select id="dgc-pj-p">'+opt("",tr("pjNone",l))
    +packages.map(p=>opt(p.id,lbl(p))).join("")+"</select>":"")
  +'<label for="dgc-pj-t">'+esc(tr("pjTag",l))+'</label><input id="dgc-pj-t" type="text" maxlength="80" autocomplete="off" list="dgc-pj-tl">'
  +'<datalist id="dgc-pj-tl">'+tags.map(t=>'<option value="'+esc(t)+'">').join("")+"</datalist>"
  +'<label for="dgc-pj-n">'+esc(tr("pjName",l))+'</label><input id="dgc-pj-n" type="text" maxlength="200" autocomplete="off">'
  +'<div class="dgc-pj-row"><button type="button" class="dgc-pj-x">'+esc(tr("pjCancel",l))+'</button>'
  +'<button type="submit" class="dgc-pj-go">'+esc(tr("pjSave",l))+"</button></div></form>";
 document.body.appendChild(ov);
 const q=s=>ov.querySelector(s);
 const fE=q("#dgc-pj-e"),fS=q("#dgc-pj-s"),fP=q("#dgc-pj-p"),fT=q("#dgc-pj-t"),fN=q("#dgc-pj-n");
 fN.value=toolTitle(l);
 const close=()=>{try{ov.remove();document.removeEventListener("keydown",onKey,true)}catch(e){}};
 const onKey=e=>{if(e.key==="Escape"){e.stopPropagation();close()}};
 document.addEventListener("keydown",onKey,true);
 ov.addEventListener("click",e=>{if(e.target===ov)close()});
 q(".dgc-pj-x").addEventListener("click",close);
 /* a package narrows to its system when one is chosen */
 if(fS&&fP)fS.addEventListener("change",()=>{
  const sid=fS.value;
  Array.prototype.forEach.call(fP.options,o=>{if(!o.value)return;
   const p=packages.find(x=>String(x.id)===o.value);o.hidden=!!(sid&&p&&p.system_id&&String(p.system_id)!==sid)});
  const cur=fP.selectedOptions&&fP.selectedOptions[0];if(cur&&cur.hidden)fP.value="";
 });
 if(fE)fE.addEventListener("change",()=>{
  const c=calcs.find(x=>String(x.id)===fE.value);if(!c)return;
  if(fS)fS.value=systems.some(s=>String(s.id)===String(c.system_id||""))?String(c.system_id):"";
  if(fP)fP.value=packages.some(p=>String(p.id)===String(c.package_id||""))?String(c.package_id):"";
  fT.value=String(c.tag||"");fN.value=String(c.title||"");
 });
 q("form").addEventListener("submit",e=>{
  e.preventDefault();
  const go=q(".dgc-pj-go");go.disabled=true;
  const fresh=recordBuild()||rec;
  const sid=fS?fS.value:"",pid=fP?fP.value:"";
  const sys=systems.find(s=>String(s.id)===sid),pkg=packages.find(p=>String(p.id)===pid);
  const entry={
   /* empty id = the runtime mints it; its calculationId() falls back to
      milliseconds when two attachments land inside the same second */
   id:(fE&&fE.value)||"",
   attached_at:nowISO(),
   tool_revision:toolRev(),
   system_id:sys?String(sys.id):"",
   package_id:pkg?String(pkg.id):"",
   tag:String(fT.value||"").trim(),
   title:String(fN.value||"").trim(),
   permalink:fresh.permalink||"",
   record:{inputs:fresh.inputs,outputs:fresh.outputs,units:fresh.units,model:fresh.model,warnings:fresh.warnings}
  };
  projectRuntime().then(DP=>{
   if(!DP){pjFail(tr("pjNoRuntime",l),l);go.disabled=false;return}
   if(typeof DP.attachCalculation!=="function"){pjFail(tr("pjOldRuntime",l),l);go.disabled=false;return}
   let r=null;
   try{r=DP.attachCalculation(entry)}catch(x){warn(x);r={ok:false,reason:String(x&&x.message||x)}}
   Promise.resolve(r).then(res=>{
    const ok=res===true||!!(res&&res.ok);
    if(!ok){
     const why=res&&(res.message||(Array.isArray(res.problems)&&res.problems.join("; "))||res.reason)||"?";
     pjFail(String(why),l);go.disabled=false;return;
    }
    close();
    /* ok with stored:false = the document changed in memory only (§3.5) */
    if(res&&typeof res==="object"&&res.stored===false){pjUnstored(res,entry,l);return}
    const meta=pkgMeta();
    const revn=(res&&res.package_revision)||(meta&&meta.revision)||"?";
    notify(tr("pjDone",l).replace("%p",project).replace("%i",String((res&&res.id)||entry.id)).replace("%r",String(revn)),"ok");
    try{buildBar()}catch(x){warn(x)}
   },x=>{warn(x);pjFail(String(x&&x.message||x),l);go.disabled=false});
  });
 });
 try{(fE||fS||fP||fT).focus()}catch(e){}
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
 #dgc-bar .dgc-stamp{font:400 10px/1.25 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  color:#6f7c8c;letter-spacing:.02em;white-space:nowrap;align-self:center;pointer-events:none;
  background:rgba(255,255,255,.86);border-radius:999px;padding:4px 9px;border:1px solid #e0e6ee}
 @media print{#dgc-bar{display:none}}
 @media(max-width:640px){#dgc-bar{bottom:60px}#dgc-menu,#dgc-notes{bottom:104px}}
 @media(prefers-color-scheme:dark){
  #dgc-bar button,#dgc-bar a{background:#161b22;color:#e6edf3;border-color:#30363d}
  #dgc-bar button:hover,#dgc-bar a:hover{background:#22303f}
  #dgc-bar .dgc-home{background:#2f5fb5;border-color:#2f5fb5;color:#fff}
  #dgc-bar .dgc-status{background:#132a19;border-color:#2f6b3d;color:#9fe0b4}
  #dgc-bar .dgc-status:hover{background:#1a3a23}
  #dgc-bar .dgc-status-proto{background:#2b2110;border-color:#8c641c;color:#ffe2a1}
  #dgc-bar .dgc-status-proto:hover{background:#3a2c14}
  #dgc-bar .dgc-stamp{color:#8b98a8;background:rgba(22,27,34,.86);border-color:#2b3340}
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
/* ---- build stamp ------------------------------------------------------
   When one URL can answer with three different builds -- as this site's edge
   cache did on 2026-09-10, returning v3.7.3, v4.1 and v4.2 in five requests --
   the only reliable way to know what is running is for the page to say so.
   The date is the tool file's own Last-Modified, so nothing is bumped by hand;
   the engine version beside it identifies diagram-common.js. Corner of the
   sheet, small, inert, and absent from print. */
function shortVersion(){
 const m=/v(\d+\.\d+)/.exec(VERSION);
 return m?"v"+m[1]:VERSION;
}
function stampWhen(){
 let d=null;
 try{d=new Date(document.lastModified)}catch(e){}
 if(!d||isNaN(d.getTime()))return"";
 const p=n=>String(n).padStart(2,"0");
 return d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())+" "+p(d.getHours())+":"+p(d.getMinutes());
}
/* The stamp rides at the end of the framework bar rather than free in the
   corner: a fixed corner belongs to the tool, and on this sheet the tool's own
   sticky panel sat on top of it. Inside the bar it wraps with the bar and can
   collide with nothing. */
function buildStamp(bar){
 if(!bar)return;
 const el=document.createElement("span");
 el.className="dgc-stamp";
 el.setAttribute("aria-hidden","true");
 bar.appendChild(el);
 const when=stampWhen();
 el.textContent=(when?when+" · ":"")+shortVersion();
 el.title=toolFile()+(when?" · "+document.lastModified:"")
  +" · diagram-common.js "+VERSION+(toolRev()?" · "+toolRev():"");
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
 safe(pjChip,null)(bar,l);
 if(CFG.state&&typeof CFG.state.serialize==="function")add(tr("copyLink",l),()=>{
  const u=stateLink();
  const kb=Math.round(u.length/102.4)/10;
  /* The same fingerprint the printed sheet carries, computed from the same
     bytes by the same function, so a reader holding a sheet can read it off
     the page and compare. */
  const fp=fpText(stateFingerprint(u));
  const tag=fp?" "+tr("rStateFp",l)+colon(l)+fp:"";
  const done=()=>{notify(tr("linkCopied",l)+tag,"ok");
   if(u.length>4096)notify(tr("linkLong",l).replace("%n",kb),"warn")};
  try{navigator.clipboard.writeText(u).then(done,()=>notify(tr("linkHere",l)+tag,null,u))}
  catch(e){notify(tr("linkHere",l)+tag,null,u)}
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
 safe(wfButtons,null)(bar,l);
 buildStamp(bar);
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
 /* The report's quantity vocabulary, for a tool that builds its own table.
    klimaatcalculator carries twenty-four quantities for each of three
    strategies and had no name for any of them outside the report. */
 label:(k,u,l)=>reportKey(k,u||"",l||currentLang()),
 unit:u=>prettyUnit(u),
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
 state:{encode:encodeState,decode:decodeState,link:stateLink,current:serializeState,
   fingerprint:stateFingerprint,payload:statePayload,address:permaAddress},
 record:{build:recordBuild,schema:RECORD_SCHEMA},
 export:{
  json(){const r=recordBuild();if(!r){notify(tr("noRecord"),"err");return null}
   const s=JSON.stringify(r,null,1);download(fileName("json"),"application/json",s);return s},
  csv(){const r=recordBuild();if(!r){notify(tr("noRecord"),"err");return null}
   const s=recordCSV(r);download(fileName("csv"),"text/csv",s);return s},
  download:download
 },
 report:report,
 figure:figureFrom,
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
