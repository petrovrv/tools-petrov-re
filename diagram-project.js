/* tools.petrov.re — project package runtime (tools.petrov.re/project-package/v1).
   Single global: window.DiagramProject. No build step, no dependencies, no network.
   Inert until a tool calls it: nothing here runs on load except the global assignment.

   This file is loaded by the project-delivery tools, by the control and electrical
   tools that write a register (TZ-engineering-workflow §8), and lazily by
   diagram-common.js when a user presses "Attach to project" in a calculation tool.
   It is deliberately not part of diagram-common.js: most pages have no project to
   carry, so nothing here is parsed on a page that never asks for it.

   The contracts are TZ-project-package.md and TZ-engineering-workflow.md §2–§4.

   The rules this file enforces on behalf of every tool, so that no tool has to
   remember them:

     §3.1 explicit load   — nothing is ever applied on boot. peek() reports, load()
                            hands the document back, and only the tool's own user
                            action applies it.
     §3.2 say what you ignored — load() returns the sections the caller declared it
                            reads AND the list it ignored, computed from the
                            manifest, not from the tool's memory.
     §3.3 write only what you own — save() accepts only the paths named in the
                            caller's manifest `writes`, at array granularity: a tool
                            declaring `structure.packages` cannot touch
                            `structure.systems`. A patch reaching outside those paths
                            writes NOTHING and says so, loudly. The rest of the
                            document is copied through byte-identically.
     §2.2 per-array owners — `writes` may be a dotted path. Provenance keys on the
                            same path, so each array keeps its own authorship.
     §2.3 flag validation  — `flags` is the one section whose CONTENT is checked:
                            one tool writes it and every other tool renders it, so a
                            malformed entry refuses the whole save. The registers are
                            deliberately untyped; their shapes belong to their owners.
     §2.4 provenance      — save() writes the provenance entry itself. There is no
                            code path that writes a section without one.
     §2.5 unknown keys    — top-level keys this schema does not name survive a round
                            trip verbatim, restored to the TOP LEVEL. `unknown` is
                            an in-memory holding pen inside this runtime and never
                            a key in the stored document.
     §3.5 storage can fail — every localStorage touch is wrapped; a throw or an
                            empty result degrades to "no package loaded".
     §4   one format      — the export file is the same bytes as the storage value.
                            When a save did not reach storage, those bytes are the ones
                            writeDoc() tried to store, so the file is still one format
                            and carries the revision the tool holds rather than the
                            older revision storage kept (v4.17).
     WF§3 calculations    — every caller may write calculations.<its own manifest id>
                            and nothing else in that section, without declaring it.
                            A caller whose manifest has no project_package field (a
                            calculation tool) reads project, structure and its own
                            calculations entry; see declaration() below.
*/
(function (global) {
"use strict";
if (global.DiagramProject) return;

var API = "tools.petrov.re/project-package/v1";

/* v4.17.1 — a reported size is UTF-8 bytes, not characters: a package of Ukrainian or
   Polish text measured 12 390 characters against 12 400 bytes, and a caller comparing the
   figure with a quota would be told the document is smaller than the store must hold. */
function byteLen(text) {
 try { return new TextEncoder().encode(String(text)).length; }
 catch (e) { return unescape(encodeURIComponent(String(text))).length; }
}
var VERSION = "2026-09-26.project-package-5";
var LANGS = ["en", "uk", "de", "nl", "fr", "es", "pl"];

var KEY_DOC = "diagram_project_package";
var KEY_META = "diagram_project_package_meta";

/* §2 — the top-level keys this schema names. Anything else found at the top level
   of a stored document is a newer tool's data and is preserved verbatim (§2.5). */
var ENVELOPE = ["schema", "package_id", "package_revision", "created_at", "updated_at", "provenance"];
var SECTIONS = ["project", "structure", "requirements", "deliverables", "vendor_documents",
                "interfaces", "verification_evidence", "commissioning_evidence",
                "definition_decisions", "review_decisions", "flags",
                /* TZ-engineering-workflow §2 — one writer each, appended after the
                   first eleven so a stored document keeps its key order. */
                "equipment_datasheets", "requisitions", "bid_evaluations", "deviations",
                "package_readiness", "punch_items", "turnover_dossiers",
                "control_functions", "cause_effect", "io_points", "functional_tests",
                "electrical_loads", "calculations"];

/* §2.3 — the flag vocabulary. `flags` is the ONE section whose contents this
   runtime validates, and it is validated because it is the one section written by
   one tool and rendered by all the others. changeimpact's display contract says a
   receiving tool must never guess which register a wrong kind meant; that rule only
   holds if a wrong kind cannot be written in the first place.
   The registers are deliberately NOT typed: §2.3 gives each one "whatever fields
   the owning tool defines", so a schema here would be this runtime inventing seven
   shapes it has no authority over. */
var FLAG_KINDS = ["requirement", "deliverable", "vendor_document", "interface",
                  "verification_evidence", "commissioning_evidence",
                  "definition_decision", "review_decision",
                  /* TZ-engineering-workflow §2: one kind per new register */
                  "equipment_datasheet", "requisition", "bid_evaluation", "deviation",
                  "package_readiness", "punch_item", "turnover_dossier",
                  "control_function", "cause_effect", "io_point", "functional_test",
                  "electrical_load", "calculation"];
/* the register each kind points into, so a renderer can find the target row */
var KIND_SECTION = {
 requirement: "requirements", deliverable: "deliverables", vendor_document: "vendor_documents",
 "interface": "interfaces", verification_evidence: "verification_evidence",
 commissioning_evidence: "commissioning_evidence", definition_decision: "definition_decisions",
 review_decision: "review_decisions", equipment_datasheet: "equipment_datasheets",
 requisition: "requisitions", bid_evaluation: "bid_evaluations", deviation: "deviations",
 package_readiness: "package_readiness", punch_item: "punch_items",
 turnover_dossier: "turnover_dossiers", control_function: "control_functions",
 cause_effect: "cause_effect", io_point: "io_points", functional_test: "functional_tests",
 electrical_load: "electrical_loads", calculation: "calculations"
};
var FLAG_WORDS = ["stale", "affected", "superseded"];
var FLAG_REQUIRED = ["target_kind", "target_id", "flag", "reason", "raised_by", "raised_at"];

/* -> [] when every entry is well formed, else one plain-language problem per fault,
   each naming the index so the caller can point at the entry. */
function validateFlags(value) {
 var out = [];
 if (!Array.isArray(value)) { out.push("flags must be an array, got " + (value === null ? "null" : typeof value)); return out; }
 value.forEach(function (f, i) {
  var at = "flags[" + i + "]";
  if (!isObj(f)) { out.push(at + " must be an object, got " + (Array.isArray(f) ? "an array" : f === null ? "null" : typeof f)); return; }
  FLAG_REQUIRED.forEach(function (k) {
   if (f[k] === undefined || f[k] === null || String(f[k]) === "") out.push(at + "." + k + " is required");
  });
  if (f.target_kind !== undefined && FLAG_KINDS.indexOf(String(f.target_kind)) < 0) {
   out.push(at + ".target_kind is \"" + String(f.target_kind) + "\", not one of " + FLAG_KINDS.join(" | "));
  }
  if (f.flag !== undefined && FLAG_WORDS.indexOf(String(f.flag)) < 0) {
   out.push(at + ".flag is \"" + String(f.flag) + "\", not one of " + FLAG_WORDS.join(" | "));
  }
  if (f.raised_against_revision !== undefined) {
   var n = f.raised_against_revision;
   if (typeof n !== "number" || !isFinite(n) || Math.floor(n) !== n) {
    out.push(at + ".raised_against_revision must be an integer, got " + JSON.stringify(n));
   }
  }
 });
 return out;
}

/* §2.3 — registers that look like one thing and are two, because they have two
   owners: deliverables/vendor_documents and verification_evidence/commissioning_
   evidence. Exactly one tool writes each. They are NOT to be merged back into a
   convenience alias: one array with two writers is precisely the shape where a
   whole-section write destroys the other tool's register. */

/* §2.2 — a section whose arrays have different owners. `structure.packages` belongs
   to interfacebuilder and `structure.systems` to commissioningturnover, so a tool
   declares the array it owns and save() refuses everything else in that section.
   Ownership is enforced here, not remembered by eight tools. Extend only with a
   section that genuinely has more than one author. */
var SUBPATHS = { structure: ["systems", "packages"] };

/* TZ-engineering-workflow §3 — `calculations` is keyed by tool id, and each key has
   exactly one writer: the tool whose manifest id it is. The key set is open (any
   tool may attach), so it cannot be a fixed SUBPATHS list; the one path a caller
   may write is computed from its own manifest id and granted implicitly. Nobody
   may write the section whole, and no manifest can name another tool's key. */
var CALC = "calculations";
var TOOL_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
function validToolId(x) { return typeof x === "string" && TOOL_ID_RE.test(x); }

/* §2.1 — the canonical stage vocabulary. One list, shared with the industry packs
   (§8); a tool maps its own spelling to it and back and never extends it here. */
var LIFECYCLE = ["concept", "basic", "detailed", "procurement", "factory", "construction",
                 "commissioning", "handover", "operations", "close-out", "decommissioning"];
var PROJECT_TYPES = ["greenfield", "brownfield", "modification", "decommissioning"];

/* ---------- seven-language strings for the shared package panel ----------
   The package UI is the same twelve sentences on all eight pages. Keeping them
   here means one translation instead of eight, and no slot can be left in
   English inside a non-English key (§3.6). Tools render them; this file does
   not touch the DOM. */
var STR = {
 panel: {en:"Project package",uk:"Пакет проєкту",de:"Projektpaket",nl:"Projectpakket",fr:"Dossier de projet",es:"Paquete del proyecto",pl:"Pakiet projektu"},
 status: {en:"Package status",uk:"Стан пакета",de:"Paketstatus",nl:"Pakketstatus",fr:"État du dossier",es:"Estado del paquete",pl:"Stan pakietu"},
 none: {en:"No project package is available. This tool works exactly as it does without one.",uk:"Пакет проєкту недоступний. Інструмент працює так само, як і без нього.",de:"Kein Projektpaket vorhanden. Das Werkzeug arbeitet genau wie ohne Paket.",nl:"Geen projectpakket beschikbaar. De tool werkt precies zoals zonder pakket.",fr:"Aucun dossier de projet disponible. L'outil fonctionne exactement comme sans dossier.",es:"No hay paquete de proyecto disponible. La herramienta funciona igual que sin él.",pl:"Brak pakietu projektu. Narzędzie działa dokładnie tak jak bez niego."},
 available: {en:"A package for “{project}” is available, revision {rev}, updated {when}. Nothing has been applied — press Load to apply it.",uk:"Доступний пакет для «{project}», ревізія {rev}, оновлено {when}. Нічого не застосовано — натисніть «Завантажити», щоб застосувати.",de:"Ein Paket für „{project}“ liegt vor, Revision {rev}, aktualisiert {when}. Es wurde nichts übernommen — zum Übernehmen „Laden“ drücken.",nl:"Er is een pakket voor “{project}”, revisie {rev}, bijgewerkt {when}. Er is niets toegepast — druk op Laden om het toe te passen.",fr:"Un dossier pour « {project} » est disponible, révision {rev}, mis à jour le {when}. Rien n'a été appliqué — appuyez sur Charger pour l'appliquer.",es:"Hay un paquete para «{project}», revisión {rev}, actualizado {when}. No se ha aplicado nada: pulse Cargar para aplicarlo.",pl:"Dostępny jest pakiet dla „{project}”, rewizja {rev}, zaktualizowany {when}. Nic nie zostało zastosowane — naciśnij Wczytaj, aby go zastosować."},
 loadBtn: {en:"Load project package",uk:"Завантажити пакет проєкту",de:"Projektpaket laden",nl:"Projectpakket laden",fr:"Charger le dossier de projet",es:"Cargar paquete del proyecto",pl:"Wczytaj pakiet projektu"},
 saveBtn: {en:"Save to project package",uk:"Зберегти до пакета проєкту",de:"In Projektpaket speichern",nl:"Opslaan in projectpakket",fr:"Enregistrer dans le dossier",es:"Guardar en el paquete",pl:"Zapisz do pakietu projektu"},
 exportBtn: {en:"Export project package",uk:"Експортувати пакет проєкту",de:"Projektpaket exportieren",nl:"Projectpakket exporteren",fr:"Exporter le dossier de projet",es:"Exportar paquete del proyecto",pl:"Eksportuj pakiet projektu"},
 importBtn: {en:"Load package",uk:"Завантажити пакет",de:"Paket laden",nl:"Pakket laden",fr:"Charger un dossier",es:"Cargar paquete",pl:"Wczytaj pakiet"},
 clearBtn: {en:"Clear package",uk:"Очистити пакет",de:"Paket löschen",nl:"Pakket wissen",fr:"Effacer le dossier",es:"Borrar paquete",pl:"Wyczyść pakiet"},
 continueIn: {en:"Continue in {tool}",uk:"Продовжити в {tool}",de:"Weiter in {tool}",nl:"Verder in {tool}",fr:"Continuer dans {tool}",es:"Continuar en {tool}",pl:"Kontynuuj w {tool}"},
 applied: {en:"Applied from the package: {list}.",uk:"Застосовано з пакета: {list}.",de:"Aus dem Paket übernommen: {list}.",nl:"Uit het pakket toegepast: {list}.",fr:"Appliqué depuis le dossier : {list}.",es:"Aplicado desde el paquete: {list}.",pl:"Zastosowano z pakietu: {list}."},
 ignored: {en:"Ignored, outside this tool's scope: {list}.",uk:"Проігноровано, поза сферою цього інструмента: {list}.",de:"Ignoriert, außerhalb des Aufgabenbereichs dieses Werkzeugs: {list}.",nl:"Genegeerd, buiten het bereik van deze tool: {list}.",fr:"Ignoré, hors du périmètre de cet outil : {list}.",es:"Ignorado, fuera del alcance de esta herramienta: {list}.",pl:"Pominięto, poza zakresem tego narzędzia: {list}."},
 ignoredNone: {en:"Nothing in the package was outside this tool's scope.",uk:"У пакеті немає нічого поза сферою цього інструмента.",de:"Nichts im Paket lag außerhalb des Aufgabenbereichs dieses Werkzeugs.",nl:"Niets in het pakket viel buiten het bereik van deze tool.",fr:"Rien dans le dossier n'était hors du périmètre de cet outil.",es:"Nada del paquete quedó fuera del alcance de esta herramienta.",pl:"Nic w pakiecie nie wykraczało poza zakres tego narzędzia."},
 unmapped: {en:"Not applied, no equivalent value in this tool: {list}. The package keeps the original.",uk:"Не застосовано, немає відповідника в цьому інструменті: {list}. Пакет зберігає початкове значення.",de:"Nicht übernommen, kein entsprechender Wert in diesem Werkzeug: {list}. Das Paket behält den Originalwert.",nl:"Niet toegepast, geen equivalent in deze tool: {list}. Het pakket behoudt de oorspronkelijke waarde.",fr:"Non appliqué, aucune valeur équivalente dans cet outil : {list}. Le dossier conserve la valeur d'origine.",es:"No aplicado, no hay valor equivalente en esta herramienta: {list}. El paquete conserva el original.",pl:"Nie zastosowano, brak odpowiednika w tym narzędziu: {list}. Pakiet zachowuje wartość pierwotną."},
 replaced: {en:"Replaced what was typed here: {list}.",uk:"Замінено введені тут значення: {list}.",de:"Hier Eingegebenes ersetzt: {list}.",nl:"Wat hier was ingevuld is vervangen: {list}.",fr:"Remplacé ce qui était saisi ici : {list}.",es:"Se sustituyó lo escrito aquí: {list}.",pl:"Zastąpiono wpisane tutaj wartości: {list}."},
 saved: {en:"Saved to the package: {list}. The package is now at revision {rev}.",uk:"Збережено до пакета: {list}. Пакет тепер має ревізію {rev}.",de:"Im Paket gespeichert: {list}. Das Paket steht jetzt bei Revision {rev}.",nl:"Opgeslagen in het pakket: {list}. Het pakket staat nu op revisie {rev}.",fr:"Enregistré dans le dossier : {list}. Le dossier est maintenant à la révision {rev}.",es:"Guardado en el paquete: {list}. El paquete está ahora en la revisión {rev}.",pl:"Zapisano do pakietu: {list}. Pakiet jest teraz w rewizji {rev}."},
 rejected: {en:"Refused, this tool does not own these sections: {list}.",uk:"Відхилено, цей інструмент не володіє цими розділами: {list}.",de:"Abgelehnt, dieses Werkzeug besitzt diese Abschnitte nicht: {list}.",nl:"Geweigerd, deze tool bezit deze secties niet: {list}.",fr:"Refusé, cet outil n'est pas propriétaire de ces sections : {list}.",es:"Rechazado, esta herramienta no posee estas secciones: {list}.",pl:"Odrzucono, to narzędzie nie jest właścicielem tych sekcji: {list}."},
 storageOff: {en:"Browser storage is unavailable, so a package cannot be kept between tools here. Export the package file and load it in the next tool instead.",uk:"Сховище браузера недоступне, тож пакет не можна передати між інструментами. Експортуйте файл пакета і завантажте його в наступному інструменті.",de:"Der Browser-Speicher ist nicht verfügbar, ein Paket kann hier nicht zwischen Werkzeugen weitergegeben werden. Exportieren Sie die Paketdatei und laden Sie sie im nächsten Werkzeug.",nl:"Browseropslag is niet beschikbaar, dus een pakket kan hier niet tussen tools worden bewaard. Exporteer het pakketbestand en laad het in de volgende tool.",fr:"Le stockage du navigateur est indisponible : un dossier ne peut pas circuler entre les outils ici. Exportez le fichier et chargez-le dans l'outil suivant.",es:"El almacenamiento del navegador no está disponible, así que el paquete no puede pasar entre herramientas. Exporte el archivo y cárguelo en la siguiente herramienta.",pl:"Pamięć przeglądarki jest niedostępna, więc pakiet nie może przechodzić między narzędziami. Wyeksportuj plik pakietu i wczytaj go w kolejnym narzędziu."},
 quota: {en:"The package did not fit in browser storage. Export the package file instead.",uk:"Пакет не вмістився у сховищі браузера. Експортуйте файл пакета.",de:"Das Paket passte nicht in den Browser-Speicher. Exportieren Sie stattdessen die Paketdatei.",nl:"Het pakket paste niet in de browseropslag. Exporteer het pakketbestand.",fr:"Le dossier n'entre pas dans le stockage du navigateur. Exportez le fichier à la place.",es:"El paquete no cupo en el almacenamiento del navegador. Exporte el archivo.",pl:"Pakiet nie zmieścił się w pamięci przeglądarki. Wyeksportuj plik pakietu."},
 /* v4.17 — the export dialog says which revision the file carries. A file that
    is ahead of storage is the only copy of that revision, and the sentence says
    so where the user is looking (§4). Four cases, one sentence each: the file
    equals what storage holds (exportStored); the file is ahead of an older
    stored document (exportAhead); the file is ahead and storage holds nothing
    (exportAheadEmpty); the document came from a file and was never stored
    (exportHeld) — that last one must not claim storage holds the same document,
    because storage holds nothing at all. */
 exportTitle: {en:"Project package file",uk:"Файл пакета проєкту",de:"Projektpaketdatei",nl:"Projectpakketbestand",fr:"Fichier du dossier de projet",es:"Archivo del paquete del proyecto",pl:"Plik pakietu projektu"},
 exportStored: {en:"The file carries revision {rev}, the same document that is in browser storage.",uk:"Файл містить ревізію {rev} — той самий документ, що й у сховищі браузера.",de:"Die Datei enthält Revision {rev} — dasselbe Dokument, das im Browser-Speicher liegt.",nl:"Het bestand bevat revisie {rev}, hetzelfde document als in de browseropslag.",fr:"Le fichier porte la révision {rev}, le même document que celui du stockage du navigateur.",es:"El archivo contiene la revisión {rev}, el mismo documento que está en el almacenamiento del navegador.",pl:"Plik zawiera rewizję {rev} — ten sam dokument, który jest w pamięci przeglądarki."},
 exportAhead: {en:"The file carries revision {rev}. Browser storage still holds revision {stored}, because the last save did not fit. This file is the only copy of revision {rev}.",uk:"Файл містить ревізію {rev}. У сховищі браузера залишилася ревізія {stored}, бо останнє збереження не вмістилося. Цей файл — єдина копія ревізії {rev}.",de:"Die Datei enthält Revision {rev}. Im Browser-Speicher steht weiterhin Revision {stored}, weil das letzte Speichern nicht hineinpasste. Diese Datei ist die einzige Kopie von Revision {rev}.",nl:"Het bestand bevat revisie {rev}. In de browseropslag staat nog revisie {stored}, omdat de laatste opslag niet paste. Dit bestand is de enige kopie van revisie {rev}.",fr:"Le fichier porte la révision {rev}. Le stockage du navigateur contient encore la révision {stored}, car le dernier enregistrement n'y entrait pas. Ce fichier est la seule copie de la révision {rev}.",es:"El archivo contiene la revisión {rev}. El almacenamiento del navegador sigue en la revisión {stored}, porque el último guardado no cupo. Este archivo es la única copia de la revisión {rev}.",pl:"Plik zawiera rewizję {rev}. W pamięci przeglądarki pozostaje rewizja {stored}, ponieważ ostatni zapis się nie zmieścił. Ten plik jest jedyną kopią rewizji {rev}."},
 exportAheadEmpty: {en:"The file carries revision {rev}. Browser storage holds no package, so this file is the only copy.",uk:"Файл містить ревізію {rev}. У сховищі браузера пакета немає, тож цей файл — єдина копія.",de:"Die Datei enthält Revision {rev}. Im Browser-Speicher liegt kein Paket, diese Datei ist also die einzige Kopie.",nl:"Het bestand bevat revisie {rev}. In de browseropslag staat geen pakket, dus dit bestand is de enige kopie.",fr:"Le fichier porte la révision {rev}. Le stockage du navigateur ne contient aucun dossier : ce fichier est la seule copie.",es:"El archivo contiene la revisión {rev}. El almacenamiento del navegador no tiene ningún paquete, así que este archivo es la única copia.",pl:"Plik zawiera rewizję {rev}. W pamięci przeglądarki nie ma pakietu, więc ten plik jest jedyną kopią."},
 exportHeld: {en:"The file carries revision {rev}, the document this page loaded from a file. Browser storage holds no package.",uk:"Файл містить ревізію {rev} — документ, який ця сторінка завантажила з файлу. У сховищі браузера пакета немає.",de:"Die Datei enthält Revision {rev} — das Dokument, das diese Seite aus einer Datei geladen hat. Im Browser-Speicher liegt kein Paket.",nl:"Het bestand bevat revisie {rev}, het document dat deze pagina uit een bestand heeft geladen. In de browseropslag staat geen pakket.",fr:"Le fichier porte la révision {rev}, le document que cette page a chargé depuis un fichier. Le stockage du navigateur ne contient aucun dossier.",es:"El archivo contiene la revisión {rev}, el documento que esta página cargó desde un archivo. El almacenamiento del navegador no tiene ningún paquete.",pl:"Plik zawiera rewizję {rev} — dokument, który ta strona wczytała z pliku. W pamięci przeglądarki nie ma pakietu."},
 exportClose: {en:"Close",uk:"Закрити",de:"Schließen",nl:"Sluiten",fr:"Fermer",es:"Cerrar",pl:"Zamknij"},
 badFile: {en:"That file is not a project package of this schema.",uk:"Цей файл не є пакетом проєкту цієї схеми.",de:"Diese Datei ist kein Projektpaket dieses Schemas.",nl:"Dat bestand is geen projectpakket van dit schema.",fr:"Ce fichier n'est pas un dossier de projet de ce schéma.",es:"Ese archivo no es un paquete de proyecto de este esquema.",pl:"Ten plik nie jest pakietem projektu tego schematu."},
 nothing: {en:"There is nothing to write into the package yet.",uk:"Поки немає чого записати до пакета.",de:"Es gibt noch nichts, was ins Paket geschrieben werden könnte.",nl:"Er is nog niets om in het pakket te schrijven.",fr:"Il n'y a encore rien à écrire dans le dossier.",es:"Todavía no hay nada que escribir en el paquete.",pl:"Nie ma jeszcze nic do zapisania w pakiecie."},
 conflict: {en:"The package disagrees with what is typed here: {list}. Both values are shown; you choose.",uk:"Пакет не збігається з введеним тут: {list}. Показано обидва значення; вибір за вами.",de:"Das Paket widerspricht den hier eingegebenen Werten: {list}. Beide Werte werden gezeigt; Sie entscheiden.",nl:"Het pakket wijkt af van wat hier is ingevuld: {list}. Beide waarden worden getoond; u kiest.",fr:"Le dossier diverge de ce qui est saisi ici : {list}. Les deux valeurs sont affichées ; vous choisissez.",es:"El paquete discrepa de lo escrito aquí: {list}. Se muestran ambos valores; usted elige.",pl:"Pakiet różni się od tego, co tu wpisano: {list}. Pokazano obie wartości; wybór należy do Ciebie."},
 sec_project: {en:"project identity",uk:"ідентифікація проєкту",de:"Projektidentität",nl:"projectidentiteit",fr:"identité du projet",es:"identidad del proyecto",pl:"tożsamość projektu"},
 sec_structure: {en:"systems and packages",uk:"системи та пакети",de:"Systeme und Pakete",nl:"systemen en pakketten",fr:"systèmes et lots",es:"sistemas y paquetes",pl:"systemy i pakiety"},
 sec_requirements: {en:"requirements",uk:"вимоги",de:"Anforderungen",nl:"eisen",fr:"exigences",es:"requisitos",pl:"wymagania"},
 sec_deliverables: {en:"deliverables",uk:"результати",de:"Liefergegenstände",nl:"op te leveren documenten",fr:"livrables",es:"entregables",pl:"produkty"},
 sec_interfaces: {en:"interfaces",uk:"інтерфейси",de:"Schnittstellen",nl:"raakvlakken",fr:"interfaces",es:"interfaces",pl:"interfejsy"},
 idDerived: {en:"Identifiers here are derived from the names, so renaming one changes its identifier and anything referring to the old one will no longer match.",uk:"Ідентифікатори тут походять від назв, тож перейменування змінює ідентифікатор, і посилання на старий більше не збігатимуться.",de:"Die Kennungen werden aus den Namen abgeleitet: Eine Umbenennung ändert die Kennung, und Verweise auf die alte passen dann nicht mehr.",nl:"Identificaties worden afgeleid van de namen: hernoemen verandert de identificatie en verwijzingen naar de oude komen niet meer overeen.",fr:"Les identifiants sont dérivés des noms : renommer change l'identifiant, et les références à l'ancien ne correspondront plus.",es:"Los identificadores se derivan de los nombres: renombrar cambia el identificador y las referencias al anterior dejarán de coincidir.",pl:"Identyfikatory pochodzą od nazw: zmiana nazwy zmienia identyfikator, a odwołania do starego przestaną pasować."},
 idCollision: {en:"These names produce the same identifier and must be made unique before they can be shared: {list}.",uk:"Ці назви дають однаковий ідентифікатор і мають стати унікальними перед передаванням: {list}.",de:"Diese Namen ergeben dieselbe Kennung und müssen vor der Weitergabe eindeutig gemacht werden: {list}.",nl:"Deze namen leveren dezelfde identificatie op en moeten uniek worden gemaakt voordat ze gedeeld kunnen worden: {list}.",fr:"Ces noms produisent le même identifiant et doivent être rendus uniques avant partage : {list}.",es:"Estos nombres producen el mismo identificador y deben hacerse únicos antes de compartirse: {list}.",pl:"Te nazwy dają ten sam identyfikator i muszą być unikalne przed udostępnieniem: {list}."},
 sec_vendor_documents: {en:"vendor documents",uk:"документи постачальника",de:"Lieferantendokumente",nl:"leveranciersdocumenten",fr:"documents fournisseur",es:"documentos del proveedor",pl:"dokumenty dostawcy"},
 sec_verification_evidence: {en:"verification evidence",uk:"докази верифікації",de:"Verifikationsnachweise",nl:"verificatiebewijs",fr:"preuves de vérification",es:"evidencias de verificación",pl:"dowody weryfikacji"},
 sec_commissioning_evidence: {en:"commissioning evidence",uk:"докази введення в експлуатацію",de:"Inbetriebnahmenachweise",nl:"commissioningbewijs",fr:"preuves de mise en service",es:"evidencias de puesta en marcha",pl:"dowody rozruchu"},
 sec_definition_decisions: {en:"design-basis decisions",uk:"рішення щодо вихідних даних",de:"Entscheidungen zur Auslegungsgrundlage",nl:"ontwerpgrondslagbesluiten",fr:"décisions de base de conception",es:"decisiones de la base de diseño",pl:"decyzje podstawy projektowej"},
 sec_review_decisions: {en:"review decisions",uk:"рішення розгляду",de:"Review-Entscheidungen",nl:"reviewbesluiten",fr:"décisions de revue",es:"decisiones de revisión",pl:"decyzje przeglądu"},
 sec_structure_systems: {en:"systems",uk:"системи",de:"Systeme",nl:"systemen",fr:"systèmes",es:"sistemas",pl:"systemy"},
 sec_structure_packages: {en:"work packages",uk:"робочі пакети",de:"Arbeitspakete",nl:"werkpakketten",fr:"lots de travaux",es:"paquetes de trabajo",pl:"pakiety robocze"},
 refused: {en:"Refused: this tool may not write {list}. Nothing was written.",uk:"Відхилено: цей інструмент не може писати {list}. Нічого не записано.",de:"Abgelehnt: Dieses Werkzeug darf {list} nicht schreiben. Es wurde nichts geschrieben.",nl:"Geweigerd: deze tool mag {list} niet schrijven. Er is niets weggeschreven.",fr:"Refusé : cet outil ne peut pas écrire {list}. Rien n'a été écrit.",es:"Rechazado: esta herramienta no puede escribir {list}. No se escribió nada.",pl:"Odrzucono: to narzędzie nie może zapisywać {list}. Nic nie zostało zapisane."},
 sec_flags: {en:"flags",uk:"позначки",de:"Markierungen",nl:"markeringen",fr:"signalements",es:"marcas",pl:"oznaczenia"},
 sec_equipment_datasheets: {en:"equipment datasheets",uk:"опитувальні листи обладнання",de:"Gerätedatenblätter",nl:"apparatuurdatabladen",fr:"fiches techniques d'équipement",es:"hojas de datos de equipos",pl:"karty danych urządzeń"},
 sec_requisitions: {en:"technical requisitions",uk:"технічні заявки на закупівлю",de:"technische Anfragespezifikationen",nl:"technische aanvraagspecificaties",fr:"réquisitions techniques",es:"requisiciones técnicas",pl:"techniczne specyfikacje zakupowe"},
 sec_bid_evaluations: {en:"bid evaluations",uk:"оцінки пропозицій",de:"Angebotsbewertungen",nl:"offertebeoordelingen",fr:"évaluations des offres",es:"evaluaciones de ofertas",pl:"oceny ofert"},
 sec_deviations: {en:"technical queries and deviations",uk:"технічні запити та відхилення",de:"technische Rückfragen und Abweichungen",nl:"technische vragen en afwijkingen",fr:"questions techniques et dérogations",es:"consultas técnicas y desviaciones",pl:"zapytania techniczne i odstępstwa"},
 sec_package_readiness: {en:"package readiness",uk:"готовність пакетів",de:"Paketbereitschaft",nl:"pakketgereedheid",fr:"état de préparation des lots",es:"preparación de paquetes",pl:"gotowość pakietów"},
 sec_punch_items: {en:"punch items",uk:"зауваження до усунення",de:"Restpunkte",nl:"restpunten",fr:"réserves",es:"puntos pendientes",pl:"usterki do usunięcia"},
 sec_turnover_dossiers: {en:"turnover dossiers",uk:"комплекти передавальної документації",de:"Übergabedossiers",nl:"overdrachtsdossiers",fr:"dossiers de remise",es:"dosieres de entrega",pl:"pakiety dokumentacji przekazania"},
 sec_control_functions: {en:"control functions",uk:"функції керування",de:"Steuerungsfunktionen",nl:"besturingsfuncties",fr:"fonctions de contrôle-commande",es:"funciones de control",pl:"funkcje sterowania"},
 sec_cause_effect: {en:"cause-and-effect matrices",uk:"матриці причин і наслідків",de:"Ursache-Wirkungs-Matrizen",nl:"oorzaak-gevolgmatrices",fr:"matrices causes-effets",es:"matrices causa-efecto",pl:"macierze przyczyn i skutków"},
 sec_io_points: {en:"I/O points",uk:"точки введення-виведення",de:"E/A-Signale",nl:"I/O-punten",fr:"points d'E/S",es:"puntos de E/S",pl:"punkty we/wy"},
 sec_functional_tests: {en:"functional tests",uk:"функціональні випробування",de:"Funktionsprüfungen",nl:"functionele testen",fr:"essais fonctionnels",es:"pruebas funcionales",pl:"próby funkcjonalne"},
 sec_electrical_loads: {en:"electrical loads",uk:"електричні навантаження",de:"elektrische Verbraucher",nl:"elektrische belastingen",fr:"charges électriques",es:"cargas eléctricas",pl:"odbiorniki elektryczne"},
 sec_calculations: {en:"attached calculations",uk:"долучені розрахунки",de:"angehängte Berechnungen",nl:"gekoppelde berekeningen",fr:"calculs rattachés",es:"cálculos adjuntos",pl:"dołączone obliczenia"},
/* flag kind names, singular, one per FLAG_KINDS entry. The first eight are
    changeimpact's own display strings, copied verbatim so a tool falling back to
    kindLabel() prints the same words changeimpact does. */
 kind_requirement:{en:"requirement",uk:"вимога",de:"Anforderung",nl:"eis",fr:"exigence",es:"requisito",pl:"wymaganie"},
 kind_deliverable:{en:"deliverable",uk:"результат",de:"Liefergegenstand",nl:"op te leveren document",fr:"livrable",es:"entregable",pl:"produkt"},
 kind_interface:{en:"interface",uk:"інтерфейс",de:"Schnittstelle",nl:"raakvlak",fr:"interface",es:"interfaz",pl:"interfejs"},
 kind_vendor_document:{en:"vendor document",uk:"документ постачальника",de:"Lieferantendokument",nl:"leveranciersdocument",fr:"document fournisseur",es:"documento del proveedor",pl:"dokument dostawcy"},
 kind_verification_evidence:{en:"verification evidence",uk:"доказ верифікації",de:"Verifikationsnachweis",nl:"verificatiebewijs",fr:"preuve de vérification",es:"evidencia de verificación",pl:"dowód weryfikacji"},
 kind_commissioning_evidence:{en:"commissioning evidence",uk:"доказ введення в експлуатацію",de:"Inbetriebnahmenachweis",nl:"commissioningbewijs",fr:"preuve de mise en service",es:"evidencia de puesta en marcha",pl:"dowód rozruchu"},
 kind_definition_decision:{en:"design-basis decision",uk:"рішення щодо основи проєктування",de:"Entscheidung zur Auslegungsbasis",nl:"besluit over ontwerpgrondslag",fr:"décision sur la base de conception",es:"decisión de base de diseño",pl:"decyzja dotycząca podstawy projektowej"},
 kind_review_decision:{en:"review decision",uk:"рішення за результатами огляду",de:"Prüfentscheidung",nl:"reviewbesluit",fr:"décision de revue",es:"decisión de revisión",pl:"decyzja z przeglądu"},
 kind_equipment_datasheet:{en:"equipment datasheet",uk:"опитувальний лист обладнання",de:"Gerätedatenblatt",nl:"apparatuurdatablad",fr:"fiche technique d'équipement",es:"hoja de datos de equipo",pl:"karta danych urządzenia"},
 kind_requisition:{en:"technical requisition",uk:"технічна заявка на закупівлю",de:"technische Anfragespezifikation",nl:"technische aanvraagspecificatie",fr:"réquisition technique",es:"requisición técnica",pl:"techniczna specyfikacja zakupowa"},
 kind_bid_evaluation:{en:"bid evaluation",uk:"оцінка пропозицій",de:"Angebotsbewertung",nl:"offertebeoordeling",fr:"évaluation des offres",es:"evaluación de ofertas",pl:"ocena ofert"},
 kind_deviation:{en:"technical query or deviation",uk:"технічний запит або відхилення",de:"technische Rückfrage oder Abweichung",nl:"technische vraag of afwijking",fr:"question technique ou dérogation",es:"consulta técnica o desviación",pl:"zapytanie techniczne lub odstępstwo"},
 kind_package_readiness:{en:"package readiness verdict",uk:"висновок про готовність пакета",de:"Urteil zur Paketbereitschaft",nl:"oordeel over pakketgereedheid",fr:"verdict de préparation du lot",es:"dictamen de preparación del paquete",pl:"ocena gotowości pakietu"},
 kind_punch_item:{en:"punch item",uk:"зауваження до усунення",de:"Restpunkt",nl:"restpunt",fr:"réserve",es:"punto pendiente",pl:"usterka do usunięcia"},
 kind_turnover_dossier:{en:"turnover dossier",uk:"комплект передавальної документації",de:"Übergabedossier",nl:"overdrachtsdossier",fr:"dossier de remise",es:"dosier de entrega",pl:"pakiet dokumentacji przekazania"},
 kind_control_function:{en:"control function",uk:"функція керування",de:"Steuerungsfunktion",nl:"besturingsfunctie",fr:"fonction de contrôle-commande",es:"función de control",pl:"funkcja sterowania"},
 kind_cause_effect:{en:"cause-and-effect matrix",uk:"матриця причин і наслідків",de:"Ursache-Wirkungs-Matrix",nl:"oorzaak-gevolgmatrix",fr:"matrice causes-effets",es:"matriz causa-efecto",pl:"macierz przyczyn i skutków"},
 kind_io_point:{en:"I/O point",uk:"точка введення-виведення",de:"E/A-Signal",nl:"I/O-punt",fr:"point d'E/S",es:"punto de E/S",pl:"punkt we/wy"},
 kind_functional_test:{en:"functional test",uk:"функціональне випробування",de:"Funktionsprüfung",nl:"functionele test",fr:"essai fonctionnel",es:"prueba funcional",pl:"próba funkcjonalna"},
 kind_electrical_load:{en:"electrical load",uk:"електричне навантаження",de:"elektrischer Verbraucher",nl:"elektrische belasting",fr:"charge électrique",es:"carga eléctrica",pl:"odbiornik elektryczny"},
 kind_calculation:{en:"attached calculation",uk:"долучений розрахунок",de:"angehängte Berechnung",nl:"gekoppelde berekening",fr:"calcul rattaché",es:"cálculo adjunto",pl:"dołączone obliczenie"},
 calcAttached: {en:"Calculation attached to the project as {id}. The package is now at revision {rev}.",uk:"Розрахунок долучено до проєкту як {id}. Пакет тепер має ревізію {rev}.",de:"Berechnung als {id} an das Projekt angehängt. Das Paket steht jetzt bei Revision {rev}.",nl:"Berekening aan het project gekoppeld als {id}. Het pakket staat nu op revisie {rev}.",fr:"Calcul rattaché au projet sous {id}. Le dossier est maintenant à la révision {rev}.",es:"Cálculo adjuntado al proyecto como {id}. El paquete está ahora en la revisión {rev}.",pl:"Obliczenie dołączono do projektu jako {id}. Pakiet jest teraz w rewizji {rev}."},
 calcReplaced: {en:"Calculation {id} replaced in the project. The package is now at revision {rev}.",uk:"Розрахунок {id} замінено в проєкті. Пакет тепер має ревізію {rev}.",de:"Berechnung {id} im Projekt ersetzt. Das Paket steht jetzt bei Revision {rev}.",nl:"Berekening {id} in het project vervangen. Het pakket staat nu op revisie {rev}.",fr:"Calcul {id} remplacé dans le projet. Le dossier est maintenant à la révision {rev}.",es:"Cálculo {id} sustituido en el proyecto. El paquete está ahora en la revisión {rev}.",pl:"Obliczenie {id} zastąpiono w projekcie. Pakiet jest teraz w rewizji {rev}."},
 calcInvalid: {en:"The calculation was not attached, nothing was written: {list}.",uk:"Розрахунок не долучено, нічого не записано: {list}.",de:"Die Berechnung wurde nicht angehängt, es wurde nichts geschrieben: {list}.",nl:"De berekening is niet gekoppeld, er is niets weggeschreven: {list}.",fr:"Le calcul n'a pas été rattaché, rien n'a été écrit : {list}.",es:"El cálculo no se adjuntó, no se escribió nada: {list}.",pl:"Obliczenia nie dołączono, nic nie zapisano: {list}."},
 calcUnresolved: {en:"These identifiers are not in the project structure: {list}. The calculation keeps them as typed.",uk:"Цих ідентифікаторів немає в структурі проєкту: {list}. Розрахунок зберігає їх як введено.",de:"Diese Kennungen fehlen in der Projektstruktur: {list}. Die Berechnung behält sie wie eingegeben.",nl:"Deze identificaties staan niet in de projectstructuur: {list}. De berekening houdt ze zoals ingevuld.",fr:"Ces identifiants ne figurent pas dans la structure du projet : {list}. Le calcul les conserve tels que saisis.",es:"Estos identificadores no están en la estructura del proyecto: {list}. El cálculo los conserva tal como se escribieron.",pl:"Tych identyfikatorów nie ma w strukturze projektu: {list}. Obliczenie zachowuje je we wpisanej postaci."}
};

/* ---------- small helpers, none of which may throw into tool code ---------- */
function warn(e) { try { if (global.console && global.console.warn) global.console.warn("[project-package]", e); } catch (x) {} }
/* A refused write is a defect in the calling tool, not a runtime hiccup: it is
   logged at error level as well as returned, so it cannot pass unnoticed. */
function err(m) { try { if (global.console && global.console.error) global.console.error("[project-package] " + m); } catch (x) {} }
function isObj(x) { return !!x && typeof x === "object" && !Array.isArray(x); }
function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } }
function nowIso() { try { return new Date().toISOString().replace(/\.\d{3}Z$/, "Z"); } catch (e) { return "1970-01-01T00:00:00Z"; } }
function pick(o, l) { if (!isObj(o)) return String(o == null ? "" : o); return o[l] || o.en || ""; }
function fillStr(s, vars) { Object.keys(vars || {}).forEach(function (k) { s = s.split("{" + k + "}").join(String(vars[k])); }); return s; }

function uuid4() {
 try {
  var c = global.crypto || global.msCrypto;
  if (c && c.getRandomValues) {
   var b = new Uint8Array(16);
   c.getRandomValues(b);
   b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
   var h = []; for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
   return h.slice(0,4).join("") + "-" + h.slice(4,6).join("") + "-" + h.slice(6,8).join("") +
          "-" + h.slice(8,10).join("") + "-" + h.slice(10,16).join("");
  }
 } catch (e) { warn(e); }
 /* file:// in an old browser with no crypto: still a v4-shaped id, still unique
    enough for a document that only ever names itself. */
 var s = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
 return s.replace(/[xy]/g, function (ch) {
  var r = Math.random() * 16 | 0;
  return (ch === "x" ? r : (r & 0x3 | 0x8)).toString(16);
 });
}

/* ---------- §3.5 storage, wrapped on every touch ----------
   A throwing localStorage (private mode, blocked site data, a sandboxed
   file:// document) must be indistinguishable from "no package loaded".
   Nothing above this line is allowed to see an exception. */
var storageBroken = false;
function ls() {
 try { var s = global.localStorage; return s && typeof s.getItem === "function" ? s : null; }
 catch (e) { storageBroken = true; return null; }
}
function readRaw(key) {
 try { var s = ls(); if (!s) return null; var v = s.getItem(key); return typeof v === "string" && v ? v : null; }
 catch (e) { storageBroken = true; warn(e); return null; }
}
function writeRaw(key, value) {
 try { var s = ls(); if (!s) return false; s.setItem(key, value); return true; }
 catch (e) { storageBroken = true; warn(e); return false; }
}
function removeRaw(key) {
 try { var s = ls(); if (!s) return false; s.removeItem(key); return true; }
 catch (e) { storageBroken = true; warn(e); return false; }
}
/* A probe that never leaves a trace, used only to tell the user why the package
   channel is missing. Its own failure is the answer. */
function storageOk() {
 try {
  var s = ls(); if (!s) return false;
  var k = "diagram_project_package_probe";
  s.setItem(k, "1"); s.removeItem(k);
  return true;
 } catch (e) { return false; }
}

/* ---------- §4 one format ----------
   ser() is the only serialiser in this file. The bytes in localStorage, the bytes
   in the exported file and the bytes an importer parses are the same bytes. */
function ser(doc) { try { return JSON.stringify(doc, null, 1); } catch (e) { warn(e); return null; } }
function de(text) { try { var v = JSON.parse(text); return isObj(v) ? v : null; } catch (e) { return null; } }

/* ---------- the caller's manifest declaration (§6) ----------
   reads/writes come from the page's own manifest, never from an argument, so a
   tool cannot widen its own scope by passing a bigger list at a call site.

   `reads`, `writes` and `writePaths` are exactly what the manifest declares.
   The implicit calculations grant (WF§3) is kept apart in `implicit_writes`,
   `implicit_reads` and `implicitWritePaths`, so a tool comparing its own
   declaration with its manifest still sees its manifest.

   A caller with NO project_package field (a calculation tool, or diagram-common's
   "Attach to project" acting for it) gets:
     reads            project, structure       — to name the project and to pick a
                                                 system / package / tag
     implicit_reads   calculations.<own id>    — its own attached records, and no
                                                 other tool's
     writes           nothing
     implicit_writes  calculations.<own id>
   A caller with no usable manifest id gets no implicit grant at all. */
var decl = null;
function declaration() {
 if (decl) return decl;
 var d = { tool: "", tool_revision: "", schema: API, reads: [], writes: [], writePaths: [], declared: false,
           implicit_reads: [], implicit_writes: [], implicitWritePaths: [] };
 try {
  var node = global.document && global.document.getElementById("diagram-tool-manifest");
  var m = node ? de(node.textContent || node.innerText || "") : null;
  if (m) {
   d.tool = String(m.id || "");
   d.tool_revision = String(m.manifest_revision || "");
   var pp = m.project_package;
   if (isObj(pp)) {
    d.declared = true;
    if (pp.schema) d.schema = String(pp.schema);
    /* a `reads` entry is always a whole section (§6) */
    d.reads = (Array.isArray(pp.reads) ? pp.reads : []).filter(function (k) { return SECTIONS.indexOf(k) >= 0; });
    /* a `writes` entry may be a whole section or a dotted path (§2.2) */
    d.writePaths = [];
    (Array.isArray(pp.writes) ? pp.writes : []).forEach(function (k) {
     var wp = parseWritePath(k, d.tool);
     if (!wp) { warn("unusable writes entry: " + k); return; }
     /* calculations.<own id> is granted below; declaring it too is harmless and
        is not counted twice */
     if (wp.section === CALC) return;
     d.writePaths.push(wp);
    });
    d.writes = d.writePaths.map(function (p) { return p.path; });
   } else if (validToolId(d.tool)) {
    d.reads = ["project", "structure"];
   }
   if (validToolId(d.tool)) {
    var own = { section: CALC, key: d.tool, path: CALC + "." + d.tool };
    d.implicitWritePaths = [own];
    d.implicit_writes = [own.path];
    d.implicit_reads = [own.path];
   }
  }
 } catch (e) { warn(e); }
 decl = d;
 return decl;
}
/* everything save() may write for this caller: the manifest paths plus the grant */
function effectivePaths(d) { return d.writePaths.concat(d.implicitWritePaths || []); }

/* ---------- write paths (§2.2, §6) ----------
   A `writes` entry is either a whole section ("interfaces") or a dotted path into a
   section with more than one owner ("structure.packages"). A `reads` entry is always
   a whole section. Anything this function does not recognise is dropped from the
   declaration, so an unparseable path can never widen what a tool may write. */
function parseWritePath(raw, ownId) {
 var p = String(raw || "");
 var dot = p.indexOf(".");
 /* nobody owns `calculations` whole: it has one writer per key (WF§3) */
 if (dot < 0) return SECTIONS.indexOf(p) >= 0 && p !== CALC ? { section: p, key: null, path: p } : null;
 var head = p.slice(0, dot), tail = p.slice(dot + 1);
 if (SECTIONS.indexOf(head) < 0) return null;
 if (head === CALC) {
  /* with an owner given (a manifest being read) only that owner's key parses;
     without one (checkWrite's hypothetical list, which grants nothing) any
     well-formed tool id does */
  if (!validToolId(tail)) return null;
  if (ownId !== undefined && tail !== ownId) return null;
  return { section: CALC, key: tail, path: CALC + "." + tail };
 }
 var allowed = SUBPATHS[head];
 if (!allowed || allowed.indexOf(tail) < 0) return null;
 return { section: head, key: tail, path: head + "." + tail };
}

/* §2.2 + §2.4 — does writing `written` replace the provenance entry at `existing`?
   A path replaces itself, and a whole-section write also replaces the entries of
   the arrays inside it, which that write has just overwritten. Writing one array
   must NEVER clear another array's authorship: `structure.packages` does not
   supersede `structure.systems`. Exposed because it is the rule per-array
   ownership rests on, and a tool that owns one array should be able to pin it. */
function supersedes(written, existing) {
 var w = String(written), e = String(existing);
 if (e === w) return true;
 if (w.indexOf(".") < 0 && e.indexOf(w + ".") === 0) return true;
 return false;
}

/* Work out what a patch is allowed to touch, without touching anything. save() and
   checkWrite() both go through here, so the predicate a tool can ask in advance is
   the same code that refuses the write. */
function planWrite(patch, paths) {
 var plan = { allowed: [], rejected: [], sections: {}, ok: false };
 Object.keys(patch).forEach(function (sec) {
  var whole = false, subs = [];
  paths.forEach(function (p) {
   if (p.section !== sec) return;
   if (p.key === null) whole = true; else subs.push(p.key);
  });
  /* A tool declaring the whole section owns every array in it; a declaration that
     names both the section and one of its arrays is taken at the wider spelling. */
  if (whole) { plan.sections[sec] = { mode: "whole" }; plan.allowed.push(sec); return; }
  if (!subs.length) { plan.rejected.push(sec); return; }
  var v = patch[sec];
  /* "I own an array here but have nothing for it this time" */
  if (v === undefined) { plan.sections[sec] = { mode: "skip" }; return; }
  if (!isObj(v)) { plan.rejected.push(sec); return; }
  var keys = Object.keys(v);
  if (!keys.length) { plan.sections[sec] = { mode: "skip" }; return; }
  var okKeys = [];
  keys.forEach(function (k) {
   if (subs.indexOf(k) < 0) { plan.rejected.push(sec + "." + k); return; }
   okKeys.push(k);
   if (v[k] !== undefined) plan.allowed.push(sec + "." + k);
  });
  if (okKeys.length) plan.sections[sec] = { mode: "partial", keys: okKeys };
 });
 plan.ok = plan.rejected.length === 0;
 return plan;
}

/* ---------- document shape ---------- */
function blankDoc() {
 var t = nowIso();
 return { schema: API, package_id: uuid4(), package_revision: 0, created_at: t, updated_at: t, provenance: [] };
}
function looksLikePackage(doc) { return isObj(doc) && String(doc.schema || "") === API; }

/* Split a stored document into the envelope, the named sections and everything
   this schema does not name (§2.5). The unnamed keys are held verbatim and put
   back at their own top level on the next write — never buried inside an `unknown`
   key in storage, because a newer tool looking for its own section would not find
   it there. §2.5 states this outright: `unknown` is an in-memory holding pen. */
function split(doc) {
 var env = {}, sec = {}, unknown = {};
 Object.keys(doc || {}).forEach(function (k) {
  if (ENVELOPE.indexOf(k) >= 0) { env[k] = doc[k]; return; }
  if (SECTIONS.indexOf(k) >= 0) { sec[k] = doc[k]; return; }
  if (k === "unknown") {
   /* a document written by an implementation that did bury them: unbury. */
   if (isObj(doc[k])) Object.keys(doc[k]).forEach(function (u) {
    if (ENVELOPE.indexOf(u) < 0 && SECTIONS.indexOf(u) < 0) unknown[u] = doc[k][u];
   });
   return;
  }
  unknown[k] = doc[k];
 });
 return { env: env, sec: sec, unknown: unknown };
}

/* ---------- held state ----------
   The last document this page read, kept so save() can copy the sections it does
   not own through byte-identically without the tool carrying them. */
var held = null;

/* ---------- v4.17: the document storage does not have ----------
   TZ-project-package §4 makes the file "the backup when storage is
   unavailable". Measured before this: `save()` returned
   {ok:true, stored:false, reason:"quota", text:<the whole document>}, the tool
   printed "Export the package file instead", and `exportFile()` read storage
   first — so the download carried the revision before the failed write and none
   of the rows the user had just saved. The backup dropped exactly the data it is
   the backup for.

   `pending` is that unstored document, and it is dropped on exactly four events:
   a later write reaches storage, the user clears the package, the user imports a
   file, or another tab writes the key. It deliberately survives `load()` and
   `peek()`, which a tool calls while repainting its own panel: the unstored
   document was merged onto storage in the first place, so it is still the only
   copy of its revision after the tool has read storage again. Nothing here is a
   second format: `text` is the string `writeDoc()` tried to store (§4). */
var pending = null;
function pendingSet(doc, text) {
 try { pending = { doc: doc, text: text, revision: Number(doc && doc.package_revision) || 0, at: nowIso() }; }
 catch (e) { pending = null; warn(e); }
}
function pendingClear() { pending = null; }
function pendingValid() { return !!(pending && typeof pending.text === "string" && isObj(pending.doc)); }

function readDoc() {
 var raw = readRaw(KEY_DOC);
 if (!raw) return null;
 var doc = de(raw);
 if (!looksLikePackage(doc)) return null;
 return doc;
}

function metaFrom(doc) {
 return {
  package_id: String(doc.package_id || ""),
  project: String((isObj(doc.project) && doc.project.name) || ""),
  revision: Number(doc.package_revision) || 0,
  updated_at: String(doc.updated_at || "")
 };
}

function writeDoc(doc) {
 var text = ser(doc);
 if (text == null) return { ok: false, reason: "serialize" };
 if (!writeRaw(KEY_DOC, text)) {
  /* v4.17 — keep the bytes the store refused, so exportFile() can hand the user
     the document this page holds instead of the older one still in storage. The
     returned shape gains `text`; every caller already read `result.text` from
     save(), which was the same string. */
  pendingSet(doc, text);
  return { ok: false, reason: storageOk() ? "quota" : "storage", text: text };
 }
 pendingClear();
 /* The meta header is best-effort: a tool that cannot write it still has a valid
    document, and peek() heals a missing header on the next read. */
 writeRaw(KEY_META, ser(metaFrom(doc)) || "");
 return { ok: true, bytes: byteLen(text), text: text };
}

/* ---------- public: peek ---------- */
/* Reads the small header only, so a page can say "a package for X is available,
   revision 7" without parsing tens of kB on every load (§4). */
function peek() {
 var raw = readRaw(KEY_META);
 var m = raw ? de(raw) : null;
 if (m && m.package_id) return { package_id: String(m.package_id), project: String(m.project || ""), revision: Number(m.revision) || 0, updated_at: String(m.updated_at || "") };
 /* header missing or corrupt but a document is there: parse once, heal, and do
    not pay that cost again. */
 var doc = readDoc();
 if (!doc) return null;
 var meta = metaFrom(doc);
 writeRaw(KEY_META, ser(meta) || "");
 return meta;
}

/* ---------- public: load ----------
   §3.1: this is called by a user action, never on boot. It applies nothing; it
   hands the tool the sections the tool declared it reads, and the list it
   ignored, so §3.2 is satisfied by this runtime rather than by each tool
   remembering to build that list. */
function load(opts) {
 var doc = readDoc();
 if (!doc) { held = null; return null; }
 return project(doc, opts);
}

function project(doc, opts) {
 opts = opts || {};
 var d = declaration();
 var parts = split(doc);
 held = doc;

 var reads = Array.isArray(opts.reads) ? opts.reads.filter(function (k) { return d.reads.indexOf(k) >= 0; }) : d.reads;
 var present = SECTIONS.filter(function (k) { return parts.sec[k] !== undefined; });
 var unknownKeys = Object.keys(parts.unknown);

 var out = {
  schema: parts.env.schema || API,
  package_id: parts.env.package_id || "",
  package_revision: Number(parts.env.package_revision) || 0,
  created_at: parts.env.created_at || "",
  updated_at: parts.env.updated_at || "",
  provenance: Array.isArray(parts.env.provenance) ? clone(parts.env.provenance) : [],
  unknown: clone(parts.unknown) || {}
 };
 reads.forEach(function (k) { if (parts.sec[k] !== undefined) out[k] = clone(parts.sec[k]); });

 /* WF§3 — a caller that does not read `calculations` whole still reads its own
    key. `calculations` is reported as ignored only when it carries another
    tool's entries, which is then the truth. */
 var calcIgnored = true;
 if (reads.indexOf(CALC) < 0 && parts.sec[CALC] !== undefined) {
  var cs = parts.sec[CALC];
  var ownKey = d.implicit_reads.length ? d.tool : null;
  if (isObj(cs)) {
   if (ownKey && Object.prototype.hasOwnProperty.call(cs, ownKey)) {
    var one = {}; one[ownKey] = clone(cs[ownKey]); out[CALC] = one;
   }
   calcIgnored = Object.keys(cs).some(function (k) { return k !== ownKey; });
  }
 }

 /* Everything the document carried that this tool is not reading: named
    sections outside `reads`, plus every key the schema does not name. */
 var ignored = present.filter(function (k) { return reads.indexOf(k) < 0 && (k !== CALC || calcIgnored); }).concat(unknownKeys);

 return {
  package: out,
  meta: metaFrom(doc),
  reads: reads.slice(),
  present: present.slice(),
  ignored: ignored,
  unknown_keys: unknownKeys,
  declared: d.declared
 };
}

/* ---------- public: save ----------
   §3.3 + §2.4. The patch may name only sections in the caller's manifest
   `writes`; every other key is refused and named in the result. For each section
   actually written, the provenance entry is written here, by this function.
   There is no argument, option or order of calls that writes a section without
   its provenance entry — that is what "structurally impossible" means. */
function save(patch, opts) {
 opts = opts || {};
 var d = declaration();
 var result = { ok: false, written: [], rejected: [], skipped: [], problems: [], package_revision: 0, reason: "", stored: false, text: null };

 if (!isObj(patch)) { result.reason = "patch"; return result; }
 var paths = effectivePaths(d);
 if (!paths.length) { result.reason = "no-declaration"; return result; }

 /* opts.writes may only NARROW the manifest declaration, exactly as opts.reads
    narrows load(). It can never widen what this tool is allowed to touch. */
 if (Array.isArray(opts.writes)) {
  var want = opts.writes.map(String);
  paths = paths.filter(function (p) { return want.indexOf(p.path) >= 0; });
  if (!paths.length) { result.reason = "no-declaration"; return result; }
 }

 /* §2.2 — refusal is structural and atomic. A patch reaching outside the declared
    paths writes NOTHING, so a careless {structure:{packages,systems}} can never
    half-land and destroy the other owner's array. The caller gets ok:false, the
    exact offending paths, and an error in the console. */
 var plan = planWrite(patch, paths);
 if (!plan.ok) {
  result.rejected = plan.rejected.slice();
  result.reason = "rejected";
  err(d.tool + " may write [" + paths.map(function (p) { return p.path; }).join(", ") +
      "] but the patch reached [" + result.rejected.join(", ") + "]. Nothing was written.");
  return result;
 }

 /* §2.3 — `flags` is the one section whose CONTENT is checked. Same standard as
    the path refusal above: a malformed entry refuses the whole save, so a document
    can never carry a flag that six rendering tools would have to guess about. */
 if (patch.flags !== undefined && plan.sections.flags && plan.sections.flags.mode === "whole") {
  var flagFaults = validateFlags(patch.flags);
  if (flagFaults.length) {
   result.rejected = ["flags"];
   result.reason = "invalid";
   result.problems = flagFaults;
   err(d.tool + " sent a malformed flags register. Nothing was written. " + flagFaults.join("; "));
   return result;
  }
 }

 /* Merge onto whatever is in storage right now, not onto the snapshot this page
    loaded: another tab may have written since, and §3.3 says the sections this
    tool does not own are left as they are. Falls back to the held snapshot, then
    to a fresh document. */
 var base = readDoc() || held || blankDoc();
 var parts = split(clone(base) || blankDoc());
 var env = parts.env, sec = parts.sec, unknown = parts.unknown;

 Object.keys(plan.sections).forEach(function (name) {
  var mode = plan.sections[name].mode;
  if (mode === "skip") { result.skipped.push(name); return; }
  if (mode === "whole") {
   /* "I own this section and have nothing for it this time": left byte-identical,
      and no provenance entry, because nothing was written. */
   if (patch[name] === undefined) { result.skipped.push(name); return; }
   sec[name] = clone(patch[name]);
   result.written.push(name);
   return;
  }
  /* partial: every array in the section that this tool does NOT own is carried
     through from the stored document untouched. */
  var cur = isObj(sec[name]) ? clone(sec[name]) : {};
  var wroteHere = false;
  plan.sections[name].keys.forEach(function (k) {
   if (patch[name][k] === undefined) { result.skipped.push(name + "." + k); return; }
   cur[k] = clone(patch[name][k]);
   result.written.push(name + "." + k);
   wroteHere = true;
  });
  if (wroteHere) sec[name] = cur;
 });

 if (!result.written.length) { result.reason = "empty"; return result; }

 var rev = (Number(env.package_revision) || 0) + 1;
 var t = nowIso();
 var doc = {
  schema: API,
  package_id: env.package_id || uuid4(),
  package_revision: rev,
  created_at: env.created_at || t,
  updated_at: t
 };
 /* §2.2 + §2.4 — provenance keys on the same path that was written, so each array
    keeps its own authorship. Writing a whole section also clears the entries of the
    arrays inside it, which that write has just replaced. */
 var prov = (Array.isArray(env.provenance) ? clone(env.provenance) : []).filter(function (p) {
  if (!isObj(p)) return false;
  var path = String(p.path);
  for (var i = 0; i < result.written.length; i++) {
   if (supersedes(result.written[i], path)) return false;
  }
  return true;
 });
 result.written.forEach(function (k) {
  prov.push({ path: k, tool: d.tool, tool_revision: opts.toolRevision || d.tool_revision, written_at: t, package_revision: rev });
 });
 doc.provenance = prov;

 SECTIONS.forEach(function (k) { if (sec[k] !== undefined) doc[k] = sec[k]; });
 /* §2.5 — a newer tool's keys go back at their own top level, verbatim. A key
    that would shadow a named section never wins. */
 Object.keys(unknown).forEach(function (k) { if (doc[k] === undefined) doc[k] = unknown[k]; });

 var w = writeDoc(doc);
 held = doc;
 result.ok = true;
 result.package_revision = rev;
 result.stored = !!w.ok;
 result.text = w.text || ser(doc);
 if (!w.ok) result.reason = w.reason;
 notifyAvailable();
 return result;
}

/* ---------- public: checkWrite ----------
   The same predicate save() uses, with nothing written and no storage touched. A
   tool can ask in advance whether a patch is within its declared paths; pass
   {writes:[...]} to ask the question against a different declaration. Because it
   writes nothing, an explicit list here grants no access. */
function checkWrite(patch, opts) {
 opts = opts || {};
 var paths, shown, implicit = [];
 if (Array.isArray(opts.writes)) {
  paths = [];
  opts.writes.forEach(function (k) { var wp = parseWritePath(k); if (wp) paths.push(wp); });
  shown = paths;
 } else {
  var d = declaration();
  paths = effectivePaths(d);
  /* `writes` stays the manifest declaration, as in v1; the grant is reported
     beside it */
  shown = d.writePaths;
  implicit = d.implicit_writes.slice();
 }
 var plan = planWrite(isObj(patch) ? patch : {}, paths);
 return { ok: plan.ok, allowed: plan.allowed.slice(), rejected: plan.rejected.slice(),
          writes: shown.map(function (p) { return p.path; }), implicit_writes: implicit };
}

/* ---------- public: exportFile ----------
   §4 — the same bytes as the storage value. The file is not re-serialised with
   different spacing, a different key order or a trailing newline; it is the
   string that is (or would be) in localStorage. */
/* WF§1 — `<project.reference or package_id>.petrov.json`. Characters no file
   system accepts are replaced; letters in any script are kept. */
function fileName(doc) {
 doc = doc || readDoc() || held;
 var ref = doc && isObj(doc.project) ? String(doc.project.reference || "").trim() : "";
 var base = ref || (doc ? String(doc.package_id || "") : "") || "project";
 base = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, "-").replace(/^[-.]+|[-.]+$/g, "").slice(0, 80) || "project";
 return base + ".petrov.json";
}
function download(name, text) {
 try {
  /* diagram-common owns the download path on every page that loads it; reuse it
     so a file:// page and a served page behave the same way. */
  if (global.Diagram && global.Diagram.export && typeof global.Diagram.export.download === "function") {
   global.Diagram.export.download(name, "application/json", text);
   return true;
  }
  var blob = new global.Blob([text], { type: "application/json" });
  var url = global.URL.createObjectURL(blob);
  var a = global.document.createElement("a");
  a.href = url; a.download = name;
  global.document.body.appendChild(a); a.click();
  setTimeout(function () { try { global.document.body.removeChild(a); global.URL.revokeObjectURL(url); } catch (e) {} }, 0);
  return true;
 } catch (e) { warn(e); return false; }
}
/* v4.17 — which document the file carries, and why. Storage wins while it is
   level with or ahead of this page; an unstored save wins over the older document
   it failed to replace, because that is the one case where the file is the only
   copy. `text` is in both branches the string writeDoc() wrote or tried to write,
   so §4 still holds: one format, the same bytes.
   -> { doc, text, source: "unstored"|"storage"|"held", storedRevision } or null. */
function exportSource() {
 var stored = readDoc();
 var storedRev = stored ? (Number(stored.package_revision) || 0) : null;
 if (pendingValid() && (storedRev === null || pending.revision >= storedRev)) {
  return { doc: pending.doc, text: pending.text, source: "unstored", storedRevision: storedRev };
 }
 var doc = stored || held;
 if (!doc) return null;
 return { doc: doc, text: ser(doc), source: stored ? "storage" : "held", storedRevision: storedRev };
}
/* The sentence the export dialog shows, in `lang`. Kept here with the other
   twelve package sentences so eight tools do not translate it eight times. */
function exportSentence(info, lang) {
 if (!info) return "";
 var rev = Number(info.doc && info.doc.package_revision) || 0;
 /* "held": the document came from importFile(..., {store:false}) or from a
    store that failed on an empty storage, so nothing is in storage to be the
    same as. exportSource() reaches this branch only with storedRevision null. */
 if (info.source === "held") return fillStr(pick(STR.exportHeld, lang), { rev: rev });
 if (info.source !== "unstored") return fillStr(pick(STR.exportStored, lang), { rev: rev });
 if (info.storedRevision === null) return fillStr(pick(STR.exportAheadEmpty, lang), { rev: rev });
 return fillStr(pick(STR.exportAhead, lang), { rev: rev, stored: info.storedRevision });
}
/* The dialog itself. Shown only when the file is ahead of storage: that is the
   case the user cannot see from anywhere else, and a page whose save landed
   normally behaves exactly as it did before v4.17. DiagramUI owns the site's
   dialog furniture; a page without it gets a plain card, and a page where both
   fail gets a console warning and an unchanged download. */
function exportDialog(text, lang) {
 var g = global;
 try {
  if (g.DiagramUI && typeof g.DiagramUI.dialog === "function") {
   g.DiagramUI.dialog({ title: pick(STR.exportTitle, lang), body: text });
   return true;
  }
 } catch (e) { warn(e); }
 try {
  var d = g.document;
  if (!d || !d.body) return false;
  var ov = d.createElement("div");
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "false");
  ov.setAttribute("aria-live", "polite");
  ov.style.cssText = "position:fixed;z-index:9999;left:50%;bottom:18px;transform:translateX(-50%);" +
   "max-width:min(560px,calc(100vw - 24px));box-sizing:border-box;padding:12px 14px;border-radius:12px;" +
   "border:1px solid var(--line,#d6dde6);background:var(--panel,#fff);color:var(--ink,#12161d);" +
   "box-shadow:0 8px 28px rgba(16,24,40,.18);font:400 14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif";
  var h = d.createElement("strong");
  h.style.cssText = "display:block;margin:0 0 4px";
  h.appendChild(d.createTextNode(pick(STR.exportTitle, lang)));
  var pEl = d.createElement("span");
  pEl.appendChild(d.createTextNode(text));
  var b = d.createElement("button");
  b.type = "button";
  b.style.cssText = "margin-left:10px;min-height:32px;padding:4px 10px;border-radius:8px;cursor:pointer;" +
   "border:1px solid var(--line,#d6dde6);background:transparent;color:inherit;font:inherit";
  b.appendChild(d.createTextNode(pick(STR.exportClose, lang)));
  b.onclick = function () { try { if (ov.parentNode) ov.parentNode.removeChild(ov); } catch (e) {} };
  ov.appendChild(h); ov.appendChild(pEl); ov.appendChild(b);
  d.body.appendChild(ov);
  return true;
 } catch (e) { warn(e); return false; }
}
function exportLang(opts) {
 var l = opts && opts.lang;
 if (!l) { try { l = global.Diagram && typeof global.Diagram.siteLang === "function" ? global.Diagram.siteLang() : null; } catch (e) { l = null; } }
 if (!l) { try { l = global.DiagramUI && typeof global.DiagramUI.siteLang === "function" ? global.DiagramUI.siteLang() : null; } catch (e) { l = null; } }
 if (!l) { try { l = global.document && global.document.documentElement && global.document.documentElement.lang; } catch (e) { l = null; } }
 l = String(l || "en").slice(0, 2).toLowerCase();
 return LANGS.indexOf(l) >= 0 ? l : "en";
}
function exportFile(opts) {
 opts = opts || {};
 var info = exportSource();
 if (!info) return null;
 var doc = info.doc, text = info.text;
 if (text == null) return null;
 var name = opts.name || fileName(doc);
 if (opts.download !== false) download(name, text);
 var lang = exportLang(opts);
 var note = exportSentence(info, lang);
 /* opts.notice === false silences the dialog for a caller that renders the
    sentence itself; `notice` comes back either way. */
 var shown = false;
 if (info.source === "unstored" && opts.notice !== false) shown = exportDialog(note, lang);
 if (info.source === "unstored" && !shown) warn("exported revision " + (Number(doc.package_revision) || 0) +
   " from an unstored save; browser storage holds " + (info.storedRevision === null ? "no package" : "revision " + info.storedRevision));
 return { name: name, text: text, bytes: byteLen(text), meta: metaFrom(doc),
          /* v4.17, additive */
          revision: Number(doc.package_revision) || 0,
          stored_revision: info.storedRevision,
          source: info.source,
          ahead: info.source === "unstored",
          notice: note, notice_shown: shown };
}

/* ---------- public: importFile ----------
   Accepts a File, a Blob or a string. Returns a promise of the same shape load()
   returns, so a tool has one code path for "a package arrived". The imported
   document replaces the stored one; nothing is applied to the tool's state here,
   because that is still the user's separate action (§3.1). */
function importFile(file, opts) {
 opts = opts || {};
 return new Promise(function (resolve) {
  function finish(text) {
   var doc = de(String(text || ""));
   if (!looksLikePackage(doc)) { resolve({ error: "schema", package: null, ignored: [] }); return; }
   /* v4.17 — a package the user chose from a file replaces an unstored save, and
      does so before the write, so a store that itself fails leaves the imported
      document pending rather than the one it replaced. */
   pendingClear();
   if (opts.store !== false) writeDoc(doc);
   var r = project(doc, opts);
   notifyAvailable();
   resolve(r);
  }
  try {
   if (typeof file === "string") { finish(file); return; }
   if (file && typeof file.text === "function") { file.text().then(finish, function () { resolve({ error: "read", package: null, ignored: [] }); }); return; }
   if (global.FileReader && file) {
    var fr = new FileReader();
    fr.onload = function () { finish(fr.result); };
    fr.onerror = function () { resolve({ error: "read", package: null, ignored: [] }); };
    fr.readAsText(file);
    return;
   }
   resolve({ error: "read", package: null, ignored: [] });
  } catch (e) { warn(e); resolve({ error: "read", package: null, ignored: [] }); }
 });
}

/* ---------- public: clear ----------
   User-initiated only. No tool calls this as part of a save, a reset or a boot. */
function clear() {
 held = null;
 pendingClear();
 var a = removeRaw(KEY_DOC), b = removeRaw(KEY_META);
 notifyAvailable();
 return a || b;
}

/* ---------- public: onAvailable ----------
   Reports that a package exists. It never applies one — a subscriber gets the
   meta header and decides what to show. Fires asynchronously so a tool that
   subscribes during boot cannot be re-entered mid-build, and again when another
   tab writes the key. */
var subs = [];
var storageBound = false;
function notifyAvailable() {
 var m = null;
 try { m = peek(); } catch (e) { warn(e); }
 subs.slice().forEach(function (cb) { try { cb(m); } catch (e) { warn(e); } });
}
function onAvailable(cb) {
 if (typeof cb !== "function") return function () {};
 subs.push(cb);
 if (!storageBound) {
  storageBound = true;
  try {
   global.addEventListener("storage", function (ev) {
    if (!ev || (ev.key !== KEY_DOC && ev.key !== KEY_META && ev.key !== null)) return;
    held = null;
    pendingClear();
    notifyAvailable();
   });
  } catch (e) { warn(e); }
 }
 setTimeout(function () { try { cb(peek()); } catch (e) { warn(e); } }, 0);
 return function () { var i = subs.indexOf(cb); if (i >= 0) subs.splice(i, 1); };
}

/* ---------- §2.3 derived ids ----------
   Where a register needs an id no tool in the flow holds, the owning tool derives
   one, and every tool derives it the same way: <PREFIX>-<slug of the human name>.
   This lives here because two tools inventing two slug rules produce two ids for
   one thing, and every cross-reference in the package is by id (§2.2).

   The slug keeps Unicode letters rather than transliterating: the site runs in
   seven languages, and inventing a Cyrillic-to-Latin scheme would be a second
   undocumented convention. The regex is built at call time inside a try/catch so
   an engine without Unicode property escapes degrades to ASCII instead of failing
   to parse this whole file. */
var SLUG_UNICODE = null;
function slugRe() {
 if (SLUG_UNICODE !== null) return SLUG_UNICODE;
 try { SLUG_UNICODE = new RegExp("[^\\p{L}\\p{N}]+", "gu"); }
 catch (e) { SLUG_UNICODE = /[^A-Za-z0-9]+/g; }
 return SLUG_UNICODE;
}
function slug(name) {
 var s0 = String(name == null ? "" : name).toLowerCase();
 try { if (s0.normalize) s0 = s0.normalize("NFC"); } catch (e) {}
 var out = s0.replace(slugRe(), "-").replace(/^-+|-+$/g, "");
 return out.slice(0, 60).replace(/-+$/g, "");
}
/* -> "<PREFIX>-<slug>", or null when the name slugs to nothing (all punctuation,
   or empty): the caller must then ask the user for a name rather than emit an id
   that means nothing. */
function deriveId(prefix, name) {
 var p = String(prefix || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
 var body = slug(name);
 if (!p || !body) return null;
 return p + "-" + body;
}
/* Derive a whole register at once and hand back the collisions instead of silently
   emitting duplicate ids. §2.3: the name must already be unique inside the tool,
   and a tool that allows duplicates must say so. `unnamed` lists the positions that
   produced no id at all. */
function deriveIds(prefix, names) {
 var list = Array.isArray(names) ? names : [];
 var ids = [], seen = {}, duplicates = [], unnamed = [];
 list.forEach(function (n, i) {
  var id = deriveId(prefix, n);
  if (!id) { ids.push(null); unnamed.push(i); return; }
  if (seen[id]) { duplicates.push({ index: i, id: id, name: String(n), first: seen[id].index }); }
  else seen[id] = { index: i };
  ids.push(id);
 });
 return { ids: ids, duplicates: duplicates, unnamed: unnamed, ok: !duplicates.length && !unnamed.length };
}

/* ---------- vocabulary helpers (§2.1, §8) ----------
   A tool maps its own spelling to the canonical list and back. The mapping table
   lives in the tool; the vocabulary lives here, once, so the package and a future
   industry pack cannot grow two different stage lists. */
function mapTo(table, local) {
 var v = table && Object.prototype.hasOwnProperty.call(table, local) ? table[local] : undefined;
 return v === undefined ? null : v;
}
function mapFrom(table, canonical) {
 if (!table) return null;
 var keys = Object.keys(table);
 for (var i = 0; i < keys.length; i++) if (table[keys[i]] === canonical) return keys[i];
 return null;
}

/* ---------- WF§3 calculations attached to the project ----------
   One entry per explicit "Attach to project". The entry shape:
     { id, attached_at, tool_revision, system_id?, package_id?, tag?, title?,
       permalink?, record: { inputs, outputs, units?, model?, warnings? } }
   Keys beyond these are kept as given (forward compatibility). The record keeps
   its own units; this runtime checks shape only and never converts a value. */
var CALC_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
var ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
var CALC_TEXT = ["tool_revision", "system_id", "package_id", "tag", "title", "permalink"];

/* -> [] when the entry is well formed, else one plain-language problem per fault.
   `attached_at` and `tool_revision` may be absent: attachCalculation() fills them. */
function validateCalculation(e) {
 var out = [];
 if (!isObj(e)) { out.push("entry must be an object, got " + (Array.isArray(e) ? "an array" : e === null ? "null" : typeof e)); return out; }
 if (typeof e.id !== "string" || !CALC_ID_RE.test(e.id)) out.push("id must be 1–128 characters of A–Z a–z 0–9 . _ : - starting with a letter or digit, got " + JSON.stringify(e.id === undefined ? null : e.id));
 if (e.attached_at !== undefined && (typeof e.attached_at !== "string" || !ISO_RE.test(e.attached_at) || isNaN(Date.parse(e.attached_at)))) out.push("attached_at must be an ISO 8601 date-time, got " + JSON.stringify(e.attached_at));
 CALC_TEXT.forEach(function (k) {
  if (e[k] !== undefined && e[k] !== null && typeof e[k] !== "string") out.push(k + " must be a string, got " + (Array.isArray(e[k]) ? "an array" : typeof e[k]));
 });
 if (typeof e.permalink === "string" && e.permalink && !/^https?:\/\//.test(e.permalink)) out.push("permalink must be an http(s) URL, got " + JSON.stringify(e.permalink.slice(0, 60)));
 var r = e.record;
 if (!isObj(r)) { out.push("record must be an object (the calculation-record body), got " + (r === undefined ? "nothing" : Array.isArray(r) ? "an array" : r === null ? "null" : typeof r)); return out; }
 if (!isObj(r.inputs)) out.push("record.inputs must be an object");
 if (!isObj(r.outputs)) out.push("record.outputs must be an object");
 if (r.units !== undefined && r.units !== null && !isObj(r.units)) out.push("record.units must be an object");
 if (r.warnings !== undefined && r.warnings !== null && !Array.isArray(r.warnings)) out.push("record.warnings must be an array");
 if (r.model !== undefined && r.model !== null && typeof r.model !== "string" && !isObj(r.model)) out.push("record.model must be a string or an object");
 if (clone(e) === null) out.push("entry is not serialisable as JSON");
 return out;
}

/* "CALC-<tool id>-<UTC yyyymmddThhmmssZ>", the contract's example spelling. When
   that id is already in `taken` (two attachments inside one second) the
   milliseconds are added; the id stays a timestamp, never a counter. */
function calculationId(taken, when) {
 var d = declaration();
 var t = when instanceof Date ? when : new Date();
 var iso;
 try { iso = t.toISOString(); } catch (e) { iso = nowIso(); }
 var sec = iso.replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "");
 var id = "CALC-" + (d.tool || "tool") + "-" + sec;
 if (Array.isArray(taken) && taken.indexOf(id) >= 0) id = "CALC-" + (d.tool || "tool") + "-" + iso.replace(/[-:.]/g, "");
 return id;
}

/* The caller's own calculations list as stored right now (never another tool's). */
function ownCalculations(doc) {
 var d = declaration();
 var cs = doc && isObj(doc[CALC]) ? doc[CALC] : null;
 var list = cs && Array.isArray(cs[d.tool]) ? cs[d.tool] : [];
 return clone(list) || [];
}

/* Ids the entry names that the stored structure does not hold. Reported, never
   refused: §3.4 says show a disagreement, and a calculation attached before the
   structure exists is legitimate. */
function unresolvedRefs(entry, doc) {
 var st = doc && isObj(doc.structure) ? doc.structure : {};
 function ids(a) { return Array.isArray(a) ? a.map(function (x) { return isObj(x) ? String(x.id || "") : ""; }) : []; }
 var out = [];
 if (entry.system_id && ids(st.systems).indexOf(entry.system_id) < 0) out.push({ field: "system_id", id: entry.system_id });
 if (entry.package_id && ids(st.packages).indexOf(entry.package_id) < 0) out.push({ field: "package_id", id: entry.package_id });
 return out;
}

/* WF§4.4 — validate, then write calculations.<own id> through save(), so the
   refusal rules, provenance and atomicity are the ones every other write gets.
   Re-attaching an entry with an existing id replaces it in place; any other id
   is appended. opts.toolRevision is passed to save(). */
function attachCalculation(entry, opts) {
 opts = opts || {};
 var d = declaration();
 var res = { ok: false, id: "", replaced: false, problems: [], unresolved: [], written: [], rejected: [],
             package_revision: 0, reason: "", stored: false };
 if (!d.implicitWritePaths.length) { res.reason = "no-tool-id"; res.problems = ["the page manifest has no usable id"]; err("attachCalculation: " + res.problems[0]); return res; }
 /* WF§4.4 — a calculation is attached to a project that already exists. With no
    document in storage there is nothing to attach to, and minting a package here
    would give the entry a package_id no other tool ever agreed to. */
 var base = readDoc() || held;
 if (!base) { res.reason = "no-package"; res.problems = ["no project package is stored"]; return res; }
 var list = ownCalculations(base);
 var e = isObj(entry) ? clone(entry) : entry;
 if (isObj(e)) {
  if (e.id === undefined || e.id === null || e.id === "") e.id = calculationId(list.map(function (x) { return isObj(x) ? x.id : null; }));
  if (e.attached_at === undefined || e.attached_at === null || e.attached_at === "") e.attached_at = nowIso();
  if (e.tool_revision === undefined || e.tool_revision === null || e.tool_revision === "") e.tool_revision = opts.toolRevision || d.tool_revision;
 }
 var problems = validateCalculation(e);
 if (problems.length) {
  res.reason = "invalid"; res.problems = problems;
  err(d.tool + " sent a malformed calculation. Nothing was written. " + problems.join("; "));
  return res;
 }
 res.id = e.id;
 var at = -1;
 list.forEach(function (x, i) { if (at < 0 && isObj(x) && x.id === e.id) at = i; });
 if (at >= 0) { list[at] = e; res.replaced = true; } else list.push(e);
 var patch = {}; patch[CALC] = {}; patch[CALC][d.tool] = list;
 var r = save(patch, { toolRevision: opts.toolRevision });
 res.ok = r.ok; res.written = r.written; res.rejected = r.rejected; res.problems = r.problems || [];
 res.package_revision = r.package_revision; res.reason = r.reason; res.stored = r.stored;
 /* the document as it would stand: the caller offers this as the file export when
    stored is false (TZ-project-package §4, quota). */
 res.text = r.text || "";
 if (r.ok) { res.unresolved = unresolvedRefs(e, held); res.entry = clone(e); }
 return res;
}

/* Removes one of the caller's own entries by id. Same path as attach. */
function detachCalculation(id) {
 var d = declaration();
 var res = { ok: false, id: String(id || ""), removed: false, reason: "", package_revision: 0, stored: false };
 if (!d.implicitWritePaths.length) { res.reason = "no-tool-id"; return res; }
 var list = ownCalculations(readDoc() || held);
 var kept = list.filter(function (x) { return !(isObj(x) && x.id === res.id); });
 if (kept.length === list.length) { res.reason = "not-found"; return res; }
 var patch = {}; patch[CALC] = {}; patch[CALC][d.tool] = kept;
 var r = save(patch);
 res.ok = r.ok; res.removed = r.ok; res.reason = r.reason; res.package_revision = r.package_revision; res.stored = r.stored;
 res.text = r.text || "";
 return res;
}

global.DiagramProject = {
 api: API,
 version: VERSION,
 langs: LANGS.slice(),
 sections: SECTIONS.slice(),
 envelope: ENVELOPE.slice(),
 lifecycle: LIFECYCLE.slice(),
 projectTypes: PROJECT_TYPES.slice(),

 peek: peek,
 load: load,
 save: save,
 checkWrite: checkWrite,
 /* §2.3 flag vocabulary and the validator save() applies, for a tool that wants to
    check before it asks, or to render the allowed kinds */
 flagKinds: FLAG_KINDS.slice(),
 flagWords: FLAG_WORDS.slice(),
 /* flag kind -> the register it points into */
 kindSection: (function () { var o = {}; Object.keys(KIND_SECTION).forEach(function (k) { o[k] = KIND_SECTION[k]; }); return o; })(),
 validateFlags: validateFlags,
 /* the provenance replacement rule save() applies, as a pure predicate */
 supersedes: supersedes,
 exportFile: exportFile,
 /* v4.17 — the unstored document, when the last save did not reach storage:
    { revision, bytes, at } or null. Read-only; the bytes go out through
    exportFile(), which is still the only writer of the file. */
 unstored: function () { return pendingValid() ? { revision: pending.revision, bytes: byteLen(pending.text), at: pending.at } : null; },
 /* the sentence exportFile() shows, for a tool that renders it in its own panel */
 exportNotice: function (lang) { var i = exportSource(); return i ? exportSentence(i, lang || exportLang()) : ""; },
 importFile: importFile,
 clear: clear,
 onAvailable: onAvailable,

 /* WF§3/§4 — calculations attached to the project */
 attachCalculation: attachCalculation,
 detachCalculation: detachCalculation,
 validateCalculation: validateCalculation,
 calculationId: function (taken, when) { return calculationId(taken, when); },
 /* "calculations.<own manifest id>", or "" when the page has no usable id */
 calculationPath: function () { var d = declaration(); return d.implicit_writes[0] || ""; },
 fileName: function () { return fileName(); },

 /* additions to §6, all read-only conveniences the eight tools would otherwise
    each reimplement */
 declaration: declaration,
 subpaths: (function () { var o = {}; Object.keys(SUBPATHS).forEach(function (k) { o[k] = SUBPATHS[k].slice(); }); return o; })(),
 storageOk: storageOk,
 storageBroken: function () { return storageBroken; },
 /* labels a whole section or a dotted path: "structure.packages" -> "work packages" */
 /* singular name of a flag kind; an unknown kind comes back raw, never rounded
    to the nearest known one (§2.3) */
 kindLabel: function (k, l) { var o = STR["kind_" + String(k)]; return o ? pick(o, l || "en") : String(k); },
 sectionLabel: function (k, l) {
  var key = String(k).replace(/\./g, "_");
  return pick(STR["sec_" + key] || STR["sec_" + String(k).split(".")[0]] || { en: String(k) }, l || "en");
 },
 t: function (k, l, vars) { return fillStr(pick(STR[k] || { en: k }, l || "en"), vars); },
 strings: STR,
 map: { to: mapTo, from: mapFrom },
 /* §2.3 id derivation — one scheme for all eight tools */
 deriveId: deriveId,
 deriveIds: deriveIds,
 slug: slug,
 /* the exact bytes a document would occupy, for a tool that wants to show a size
    or compare two documents without a second serialiser */
 serialize: ser
};
})(window);
