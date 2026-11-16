
(() => {
"use strict";

const LANGS=["en","uk","de","nl","fr","es"];
const LANG_NAMES={en:"English",uk:"Українська",de:"Deutsch",nl:"Nederlands",fr:"Français",es:"Español"};

const TXT={
model:["Model","Модель","Modell","Model","Modèle","Modelo"],
load:["Load","Завантажити","Laden","Laden","Charger","Cargar"],
scenario:["Scenario","Сценарій","Szenario","Scenario","Scénario","Escenario"],
roof:["Roof","Покрівля","Dach","Dak","Toiture","Cubierta"],
roofArea:["Roof area","Площа покрівлі","Dachfläche","Dakoppervlak","Surface de toiture","Área de cubierta"],
roofL:["Length (m)","Довжина (м)","Länge (m)","Lengte (m)","Longueur (m)","Longitud (m)"],
roofW:["Width (m)","Ширина (м)","Breite (m)","Breedte (m)","Largeur (m)","Anchura (m)"],
parapet:["Parapet (mm)","Парапет (мм)","Attika (mm)","Opstand (mm)","Acrotère (mm)","Peto (mm)"],
dead:["Depression storage (mm)","Запас у нерівностях (мм)","Muldenrückhalt (mm)","Plasberging (mm)","Stockage en dépressions (mm)","Almacenamiento en depresiones (mm)"],
runoff:["Roof runoff coefficient","Коефіцієнт стоку покрівлі","Abflussbeiwert Dach","Afvoercoëfficiënt dak","Coefficient de ruissellement","Coeficiente de escorrentía"],
slopeX:["Roof slope X (mm/m)","Ухил покрівлі X (мм/м)","Dachgefälle X (mm/m)","Dakhelling X (mm/m)","Pente toiture X (mm/m)","Pendiente cubierta X (mm/m)"],
slopeY:["Roof slope Y (mm/m)","Ухил покрівлі Y (мм/м)","Dachgefälle Y (mm/m)","Dakhelling Y (mm/m)","Pente toiture Y (mm/m)","Pendiente cubierta Y (mm/m)"],
cellSize:["Hydraulic cell size (m)","Розмір гідравлічної комірки (м)","Hydraulische Zellgröße (m)","Hydraulische celgrootte (m)","Taille de maille hydraulique (m)","Tamaño de celda hidráulica (m)"],
manning:["Sheet-flow Manning n","Manning n для поверхневого стоку","Manning n Flächenabfluss","Manning n oppervlakkige afstroming","Manning n écoulement en nappe","Manning n flujo superficial"],
structure:["Structural ponding","Конструктивне накопичення","Tragwerksbedingte Wasserakkumulation","Constructieve wateraccumulatie","Accumulation liée à la déformation","Acumulación por deformación estructural"],
structModel:["Structural model","Розрахункова схема","Tragwerksmodell","Constructief model","Modèle structural","Modelo estructural"],
rigid:["Rigid roof","Жорстка покрівля","Starres Dach","Star dak","Toiture rigide","Cubierta rígida"],
oneWayX:["One-way span X","Однопролітна схема X","Einachsig spannend X","Eénrichtingsoverspanning X","Portée unidirectionnelle X","Luz unidireccional X"],
oneWayY:["One-way span Y","Однопролітна схема Y","Einachsig spannend Y","Eénrichtingsoverspanning Y","Portée unidirectionnelle Y","Luz unidireccional Y"],
twoWay:["Two-way plate","Двонапрямна плита","Zweiachsige Platte","Tweezijdige plaat","Dalle bidirectionnelle","Placa bidireccional"],
refDeflection:["Deflection at uniform 1 kPa (mm)","Прогин при рівномірному 1 кПа (мм)","Durchbiegung bei gleichmäßigen 1 kPa (mm)","Doorbuiging bij gelijkmatige 1 kPa (mm)","Flèche sous 1 kPa uniforme (mm)","Flecha con 1 kPa uniforme (mm)"],
structUpdate:["Geometry update interval (s)","Інтервал оновлення геометрії (с)","Geometrie-Update (s)","Geometrie-update (s)","Intervalle de mise à jour (s)","Intervalo de actualización (s)"],
structModes:["Structural modes","Структурні моди","Strukturmoden","Constructieve modi","Modes structuraux","Modos estructurales"],
deflAlert:["User deflection alert (mm)","Користувацька межа прогину (мм)","Benutzer-Grenzwert Durchbiegung (mm)","Gebruikersgrens doorbuiging (mm)","Seuil utilisateur de flèche (mm)","Alerta de flecha definida por usuario (mm)"],
maxDeflection:["Max structural deflection","Макс. конструктивний прогин","Max. Tragwerksdurchbiegung","Max. constructieve doorbuiging","Flèche structurale max.","Flecha estructural máx."],
rigidDepth:["Rigid-roof max depth","Макс. рівень без прогину","Max. Wasserhöhe starres Dach","Max. waterdiepte star dak","Hauteur max. toiture rigide","Calado máx. cubierta rígida"],
pondingAmp:["Ponding amplification","Підсилення накопичення","Ponding-Verstärkung","Versterking wateraccumulatie","Amplification de l’accumulation","Amplificación por acumulación"],
structCheck:["User deflection alert","Користувацька межа прогину","Benutzer-Grenzwert Durchbiegung","Gebruikersgrens doorbuiging","Seuil utilisateur de flèche","Alerta de flecha del usuario"],
structNote:["Calibrate the elastic model by the roof’s maximum deflection under a uniform 1 kPa load. This changes hydraulic geometry; it does not verify member strength or buckling.","Калібруйте пружну модель за максимальним прогином покрівлі під рівномірним навантаженням 1 кПа. Це змінює гідравлічну геометрію, але не перевіряє міцність або стійкість елементів.","Das elastische Modell wird über die maximale Durchbiegung bei gleichmäßigen 1 kPa kalibriert. Es verändert die hydraulische Geometrie, prüft aber weder Festigkeit noch Beulen/Knicken.","Kalibreer het elastische model met de maximale doorbuiging bij een gelijkmatige belasting van 1 kPa. Dit wijzigt de hydraulische geometrie maar controleert geen sterkte of stabiliteit.","Étalonnez le modèle élastique par la flèche maximale sous une charge uniforme de 1 kPa. Il modifie la géométrie hydraulique mais ne vérifie ni résistance ni instabilité.","Calibre el modelo elástico con la flecha máxima bajo una carga uniforme de 1 kPa. Modifica la geometría hidráulica, pero no verifica resistencia ni pandeo."],
storm:["Storm","Дощ","Regenereignis","Bui","Pluie","Tormenta"],
rain:["Horizontal rain (l/s·ha)","Горизонтальний дощ (л/с·га)","Horizontalregen (l/s·ha)","Horizontale regen (l/s·ha)","Pluie horizontale (l/s·ha)","Lluvia horizontal (l/s·ha)"],
duration:["Duration (min)","Тривалість (хв)","Dauer (min)","Duur (min)","Durée (min)","Duración (min)"],
referenceEvent:["Reference / code event","Базовий / нормативний дощ","Referenz- / Regelwerksregen","Referentie- / normbui","Pluie de référence / normative","Evento de referencia / normativo"],
referenceRain:["Reference intensity (l/s·ha)","Базова інтенсивність (л/с·га)","Referenzintensität (l/s·ha)","Referentie-intensiteit (l/s·ha)","Intensité de référence (l/s·ha)","Intensidad de referencia (l/s·ha)"],
referenceDuration:["Reference duration (min)","Базова тривалість (хв)","Referenzdauer (min)","Referentieduur (min)","Durée de référence (min)","Duración de referencia (min)"],
intensityFactor:["Intensity × reference","Інтенсивність × база","Intensität × Referenz","Intensiteit × referentie","Intensité × référence","Intensidad × referencia"],
durationFactor:["Duration × reference","Тривалість × база","Dauer × Referenz","Duur × referentie","Durée × référence","Duración × referencia"],
appliedEvent:["Applied event","Розрахунковий сценарій","Angewendetes Ereignis","Toegepaste bui","Événement appliqué","Evento aplicado"],
resetReference:["Reset ×1.00","Скинути ×1,00","Auf ×1,00 zurücksetzen","Reset ×1,00","Réinitialiser ×1,00","Restablecer ×1,00"],
referenceCode:["code value","значення норми","Regelwerkswert","normwaarde","valeur normative","valor normativo"],
referenceProject:["project / local input","проєктне / локальне значення","Projekt- / Ortswert","project- / lokale invoer","valeur projet / locale","valor de proyecto / local"],
referenceMissing:["local design intensity required","потрібна локальна розрахункова інтенсивність","lokale Bemessungsintensität erforderlich","lokale ontwerpintensiteit vereist","intensité locale de calcul requise","se requiere intensidad local de diseño"],
compareCodes:["Code comparison · same roof","Порівняння норм · одна покрівля","Regelwerksvergleich · gleiches Dach","Normvergelijking · hetzelfde dak","Comparaison des normes · même toiture","Comparación normativa · misma cubierta"],
compareMode:["Comparison rain","Дощ для порівняння","Vergleichsregen","Vergelijkingsbui","Pluie de comparaison","Lluvia de comparación"],
sameStorm:["Same applied storm for every code","Один і той самий дощ для всіх норм","Gleiches Ereignis für alle Regelwerke","Dezelfde bui voor alle normen","Même pluie pour tous les référentiels","Misma lluvia para todas las normas"],
codeStorm:["Each code/reference event × current factors","Кожна норма: свій базовий дощ × поточні множники","Je Regelwerk Referenzregen × aktuelle Faktoren","Per norm referentiebui × huidige factoren","Chaque référentiel : pluie de référence × facteurs","Cada norma: evento de referencia × factores"],
runComparison:["Compare roof","Перевірити покрівлю за нормами","Dach vergleichen","Dak vergelijken","Comparer la toiture","Comparar cubierta"],
comparisonStatus:["Comparison","Порівняння","Vergleich","Vergelijking","Comparaison","Comparación"],
comparisonCode:["Code / jurisdiction","Норма / юрисдикція","Regelwerk / Jurisdiktion","Norm / jurisdictie","Référentiel / juridiction","Norma / jurisdicción"],
comparisonEvent:["Event","Дощ","Ereignis","Bui","Événement","Evento"],
comparisonResult:["Implemented checks","Автоматизовані перевірки","Implementierte Prüfungen","Geautomatiseerde controles","Vérifications automatisées","Comprobaciones automatizadas"],
comparisonDepth:["hmax","hmax","hmax","hmax","hmax","hmax"],
comparisonTank:["Tank max","Макс. резервуар","Speicher max","Tank max","Réservoir max","Depósito máx."],
comparisonPeak:["Qout peak","Qout пік","Qout Spitze","Qout piek","Qout pointe","Qout pico"],
passStar:["PASS*","PASS*","PASS*","PASS*","PASS*","PASS*"],
failStar:["FAIL*","FAIL*","FAIL*","FAIL*","FAIL*","FAIL*"],
partial:["PARTIAL","ЧАСТКОВО","TEILWEISE","GEDEELTELIJK","PARTIEL","PARCIAL"],
inputNeeded:["INPUT","ВВІД","EINGABE","INVOER","ENTRÉE","ENTRADA"],
compareFoot:["* Pass/fail means the automated subset of the cited profile, not full statutory certification. PARTIAL means the profile still needs external/project checks. The matrix is a snapshot; rerun it after roof or storm edits.","* PASS/FAIL означає лише автоматизовану частину наведеного профілю, а не повну нормативну сертифікацію. ЧАСТКОВО — потрібні зовнішні/проєктні перевірки. Матриця є знімком; після зміни покрівлі або дощу запустіть її знову.","* PASS/FAIL bezeichnet nur den automatisierten Teil des Profils, keine vollständige baurechtliche Zertifizierung. TEILWEISE bedeutet: externe Projektprüfungen bleiben erforderlich. Die Matrix ist eine Momentaufnahme; nach Dach- oder Regenänderungen neu rechnen.","* PASS/FAIL geldt alleen voor het geautomatiseerde deel van het profiel, niet als volledige wettelijke certificering. GEDEELTELIJK betekent dat projectcontroles nodig blijven. De matrix is een momentopname; voer haar opnieuw uit na wijzigingen aan dak of bui.","* PASS/FAIL ne concerne que la partie automatisée du profil, pas une certification réglementaire complète. PARTIEL signifie que des vérifications projet restent nécessaires. La matrice est un instantané ; relancez-la après modification de la toiture ou de la pluie.","* PASS/FAIL se refiere solo a la parte automatizada del perfil, no a una certificación normativa completa. PARCIAL indica que siguen siendo necesarias verificaciones de proyecto. La matriz es una instantánea; vuelva a ejecutarla tras cambiar cubierta o lluvia."],
engineeringCalc:["Engineering calculation","Інженерний розрахунок","Ingenieurrechnung","Ingenieursberekening","Calcul d’ingénierie","Cálculo de ingeniería"],
referenceSource:["Reference source","Джерело базового дощу","Quelle Referenzregen","Bron referentiebui","Source de la pluie de référence","Fuente del evento de referencia"],
dt:["Time step (s)","Крок часу (с)","Zeitschritt (s)","Tijdstap (s)","Pas de temps (s)","Paso de tiempo (s)"],
windRain:["Wind-driven rain","Косий дощ","Schlagregen","Slagregen","Pluie battante","Lluvia impulsada por viento"],
windSpeed:["Wind speed (m/s)","Швидкість вітру (м/с)","Windgeschwindigkeit (m/s)","Windsnelheid (m/s)","Vitesse du vent (m/s)","Velocidad del viento (m/s)"],
windFrom:["Wind from (°)","Вітер звідки (°)","Wind aus (°)","Wind uit (°)","Vent venant de (°)","Viento desde (°)"],
fallSpeed:["Drop fall speed (m/s)","Швидкість падіння крапель (м/с)","Fallgeschwindigkeit Tropfen (m/s)","Valsnelheid druppels (m/s)","Vitesse de chute des gouttes (m/s)","Velocidad de caída de gotas (m/s)"],
coupling:["Wind-to-drop coupling","Зчеплення вітер–крапля","Wind–Tropfen-Kopplung","Wind-druppel koppeling","Couplage vent–goutte","Acoplamiento viento–gota"],
worstWind:["Find worst wall direction","Знайти найгірший напрямок","Ungünstigste Windrichtung","Ongunstigste windrichting","Chercher la direction défavorable","Buscar dirección más desfavorable"],
palette:["Objects","Об’єкти","Objekte","Objecten","Objets","Objetos"],
wall:["Wall","Стіна","Wand","Gevel","Mur","Muro"],
drain:["Drain","Водоприймач","Ablauf","Afvoer","Avaloir","Sumidero"],
overflow:["Overflow","Перелив","Notüberlauf","Noodoverstort","Trop-plein","Rebosadero"],
tank:["Tank","Резервуар","Speicher","Buffertank","Réservoir","Depósito"],
upperRoof:["Upper roof","Верхня покрівля","Oberes Dach","Hoger dak","Toiture haute","Cubierta superior"],
lowSpot:["Low spot","Локальне пониження","Senke","Laagte","Dépression locale","Punto bajo"],
lowDepth:["Depression depth (mm)","Глибина пониження (мм)","Senkentiefe (mm)","Diepte laagte (mm)","Profondeur dépression (mm)","Profundidad depresión (mm)"],
lowRadius:["Influence radius (m)","Радіус впливу (м)","Einflussradius (m)","Invloedsstraal (m)","Rayon d’influence (m)","Radio de influencia (m)"],
paletteHint:["Choose an object → move the ghost → click to place. Drag objects to move; Alt disables snapping.","Оберіть об’єкт → ведіть привид → клікніть для встановлення. Перетягуйте об’єкти; Alt вимикає прив’язку.","Objekt wählen → Geist bewegen → klicken. Objekte ziehen; Alt deaktiviert Rasterfang.","Kies object → beweeg de ghost → klik. Sleep objecten; Alt schakelt snapping uit.","Choisir un objet → déplacer le fantôme → cliquer. Faire glisser; Alt désactive l’accrochage.","Elija un objeto → mueva el fantasma → clic. Arrastre objetos; Alt desactiva el ajuste."],
sceneObjects:["Scene objects","Об’єкти сцени","Szenenobjekte","Scene-objecten","Objets de scène","Objetos de escena"],
fit:["Fit","Показати все","Einpassen","Passend","Cadrer","Encuadrar"],
cancel:["Cancel","Скасувати","Abbrechen","Annuleren","Annuler","Cancelar"],
run:["Run storm","Запустити дощ","Regen rechnen","Bui uitvoeren","Calculer la pluie","Simular tormenta"],
sizeTank:["Size tank","Підібрати резервуар","Speicher bemessen","Tank dimensioneren","Dimensionner le réservoir","Dimensionar depósito"],
time:["Time","Час","Zeit","Tijd","Temps","Tiempo"],
roofDepth:["Roof water","Вода на покрівлі","Wasserhöhe Dach","Water op dak","Eau en toiture","Agua en cubierta"],
tankFill:["Tank","Резервуар","Speicher","Tank","Réservoir","Depósito"],
qin:["Inflow","Приплив","Zufluss","Instroom","Apport","Entrada"],
siteOut:["Site outflow","Скид із ділянки","Abfluss Grundstück","Afvoer terrein","Rejet du site","Salida del emplazamiento"],
inspector:["Object inspector","Властивості об’єкта","Objekteigenschaften","Objecteigenschappen","Propriétés de l’objet","Propiedades del objeto"],
selectObject:["Select an object in the scene.","Оберіть об’єкт у сцені.","Objekt in der Szene wählen.","Selecteer een object.","Sélectionnez un objet.","Seleccione un objeto."],
results:["Results","Результати","Ergebnisse","Resultaten","Résultats","Resultados"],
maxDepth:["Max roof depth","Макс. рівень на покрівлі","Max. Wasserhöhe Dach","Max. waterdiepte dak","Hauteur max. toiture","Calado máx. cubierta"],
maxRoofV:["Max roof storage","Макс. об’єм на покрівлі","Max. Dachvolumen","Max. dakberging","Volume max. toiture","Volumen máx. cubierta"],
maxTankV:["Max tank volume","Макс. об’єм резервуара","Max. Speichervolumen","Max. tankvolume","Volume max. réservoir","Volumen máx. depósito"],
peakOut:["Peak site discharge","Піковий скид","Spitzenabfluss","Piekafvoer terrein","Débit de pointe","Caudal punta"],
wallVolume:["Wall runoff","Стік зі стін","Fassadenabfluss","Gevelafstroming","Ruissellement de façade","Escorrentía de muros"],
requiredTank:["Required tank","Потрібний резервуар","Erforderlicher Speicher","Benodigde tank","Réservoir requis","Depósito requerido"],
floodArea:["Peak flooded area > 10 mm","Пікова площа води > 10 мм","Max. überstaute Fläche > 10 mm","Piek overstroomd oppervlak > 10 mm","Surface noyée max. > 10 mm","Área inundada máx. > 10 mm"],
gridCells:["Hydraulic grid","Гідравлічна сітка","Hydraulisches Gitter","Hydraulisch rooster","Maillage hydraulique","Malla hidráulica"],
massBalance:["Storm mass balance","Баланс води за дощ","Wasserbilanz Ereignis","Waterbalans bui","Bilan hydrique","Balance hídrico"],
checks:["Checks","Перевірки","Prüfungen","Controles","Vérifications","Comprobaciones"],
profile:["Code profile","Нормативний профіль","Regelwerk-Profil","Normprofiel","Profil normatif","Perfil normativo"],
equations:["Core equations","Рівняння ядра","Kerngleichungen","Kernvergelijkingen","Équations du noyau","Ecuaciones del núcleo"],
normal:["Normal drainage","Нормальний водовідвід","Normalentwässerung","Normale afvoer","Évacuation normale","Drenaje normal"],
extreme:["Extreme / emergency","Екстремальний / аварійний","Extrem / Notentwässerung","Extreem / noodafvoer","Extrême / secours","Extremo / emergencia"],
retention:["Retention / controlled discharge","Утримання / дросельований скид","Rückhaltung / Drosselabfluss","Berging / geknepen afvoer","Rétention / débit régulé","Retención / descarga regulada"],
blocked:["Primary drainage blocked","Основний водовідвід заблоковано","Hauptentwässerung blockiert","Primaire afvoer geblokkeerd","Évacuation principale bloquée","Drenaje principal bloqueado"],
name:["Name","Назва","Name","Naam","Nom","Nombre"],
x:["X (m)","X (м)","X (m)","X (m)","X (m)","X (m)"],
y:["Y (m)","Y (м)","Y (m)","Y (m)","Y (m)","Y (m)"],
width:["Width (m)","Ширина (м)","Breite (m)","Breedte (m)","Largeur (m)","Ancho (m)"],
height:["Height (m)","Висота (м)","Höhe (m)","Hoogte (m)","Hauteur (m)","Altura (m)"],
azimuth:["Outward normal azimuth (°)","Азимут зовнішньої нормалі (°)","Azimut Außennormale (°)","Azimut buiten-normaal (°)","Azimut de la normale extérieure (°)","Azimut de normal exterior (°)"],
wallC:["Wall runoff coefficient","Коефіцієнт стоку стіни","Abflussbeiwert Wand","Afvoercoëfficiënt gevel","Coefficient de ruissellement mur","Coeficiente escorrentía muro"],
toRoof:["Runs onto roof","Стікає на покрівлю","Läuft aufs Dach","Loopt naar dak","Ruisselle vers toiture","Escurre a cubierta"],
capacity:["Externally verified normal flow (l/s)","Зовнішньо перевірена витрата штатного водовідводу (л/с)","Extern nachgewiesener Normalabfluss (l/s)","Extern geverifieerd normaal debiet (l/s)","Débit normal vérifié extérieurement (l/s)","Caudal normal verificado externamente (l/s)"],
threshold:["Threshold / sill (mm)","Поріг / відмітка (мм)","Schwelle (mm)","Drempel (mm)","Seuil (mm)","Umbral (mm)"],
blockage:["Blockage (%)","Блокування (%)","Blockierung (%)","Blokkering (%)","Obstruction (%)","Obstrucción (%)"],
toTank:["Route to tank","Спрямувати в резервуар","Zum Speicher","Naar tank","Vers réservoir","Hacia depósito"],
tankCapacity:["Tank capacity (m³)","Об’єм резервуара (м³)","Speichervolumen (m³)","Tankvolume (m³)","Volume du réservoir (m³)","Volumen depósito (m³)"],
initial:["Initial volume (m³)","Початковий об’єм (м³)","Anfangsvolumen (m³)","Beginvolume (m³)","Volume initial (m³)","Volumen inicial (m³)"],
throttle:["Throttled discharge (l/s)","Дросельований скид (л/с)","Drosselabfluss (l/s)","Geknepen afvoer (l/s)","Débit régulé (l/s)","Descarga regulada (l/s)"],
reuse:["Reuse demand (l/s)","Повторне використання (л/с)","Nutzung (l/s)","Hergebruik (l/s)","Réutilisation (l/s)","Reutilización (l/s)"],
catchArea:["Effective area (m²)","Ефективна площа (м²)","Wirksame Fläche (m²)","Effectief oppervlak (m²)","Surface efficace (m²)","Área efectiva (m²)"],
catchC:["Runoff coefficient","Коефіцієнт стоку","Abflussbeiwert","Afvoercoëfficiënt","Coefficient de ruissellement","Coeficiente de escorrentía"],
delete:["Delete","Видалити","Löschen","Verwijderen","Supprimer","Eliminar"],
clone:["Clone","Клонувати","Klonen","Klonen","Cloner","Clonar"],
rotate90:["Rotate 90°","Повернути на 90°","90° drehen","90° draaien","Tourner de 90°","Girar 90°"],
directRain:["Direct roof rain","Прямий дощ на покрівлю","Direkter Dachregen","Directe dakregen","Pluie directe toiture","Lluvia directa cubierta"],
upperIn:["Upper catchments","Верхні водозбори","Obere Einzugsflächen","Hogere afwaterende vlakken","Surfaces amont","Captaciones superiores"],
directPrimary:["Direct primary discharge","Прямий скид основного водовідводу","Direkter Hauptabfluss","Directe primaire afvoer","Rejet primaire direct","Descarga primaria directa"],
balanceResidual:["Balance residual","Нев’язка балансу","Bilanzrest","Balansresidu","Résidu de bilan","Residuo de balance"],
emergencyOut:["Emergency overflow","Аварійний перелив","Notüberlauf","Noodoverstort","Trop-plein d’urgence","Rebosadero de emergencia"],
tankOverflow:["Tank overflow","Перелив резервуара","Speicherüberlauf","Tankoverstort","Débordement réservoir","Rebose depósito"],
controlledOut:["Controlled + reuse","Дросель + використання","Drossel + Nutzung","Geknepen + hergebruik","Régulé + réutilisation","Regulado + reutilización"],
storedEnd:["Stored at end","Залишилось наприкінці","Restvolumen Ende","Restvolume einde","Stock final","Almacenado al final"],
draft:["draft","чернетка","Entwurf","concept","brouillon","borrador"],
pass:["PASS","ТАК","OK","OK","OK","OK"],
fail:["FAIL","НІ","NICHT OK","NIET OK","ÉCHEC","FALLA"],
info:["INFO","ІНФО","INFO","INFO","INFO","INFO"],
applyTank:["Apply to tank?","Застосувати до резервуара?","Auf Speicher anwenden?","Toepassen op tank?","Appliquer au réservoir ?","¿Aplicar al depósito?"],
sourceBasis:["Source basis","Джерельна база","Quellenbasis","Bronbasis","Base documentaire","Base documental"],
rainBasis:["Rainfall basis","База розрахункового дощу","Regenbasis","Regenbasis","Base de pluie","Base de lluvia"],
autoRules:["Automated profile checks","Автоматизовані перевірки профілю","Automatisierte Regelprüfungen","Geautomatiseerde profielcontroles","Contrôles automatisés","Comprobaciones automatizadas"],
scopeLimits:["Not automated","Не автоматизовано","Nicht automatisiert","Niet geautomatiseerd","Non automatisé","No automatizado"],
rulesChecked:["public-source rules","правила з первинних джерел","Regeln aus Primärquellen","regels uit primaire bronnen","règles de source primaire","reglas de fuente primaria"],
frameworkOnly:["framework only","лише структура","nur Regelwerksrahmen","alleen raamwerk","cadre seulement","solo marco"],
projectRain:["Enter the project/location design rainfall; no universal intensity is inserted.","Введіть розрахунковий дощ для проєкту/місця; універсальна інтенсивність не підставляється.","Projekt-/ortsbezogenen Bemessungsregen eingeben; kein pauschaler Wert wird eingesetzt.","Voer de ontwerpregen voor project/locatie in; er wordt geen universele intensiteit ingevuld.","Saisir la pluie de projet/localisation ; aucune intensité universelle n’est imposée.","Introduzca la lluvia de proyecto/localización; no se impone una intensidad universal."],
exampleRain:["The current rain value is an example/event input, not a code value.","Поточне значення дощу — приклад/вхідна подія, а не нормативна константа.","Der aktuelle Regenwert ist ein Beispiel/Ereignis, kein Normwert.","De huidige regenwaarde is een voorbeeld/gebeurtenis, geen normwaarde.","La pluie actuelle est un exemple/événement, pas une valeur normative.","La lluvia actual es un ejemplo/evento, no un valor normativo."],
minTank:["Minimum storage / tank","Мінімальний об’єм накопичення","Mindest-Speicher","Minimale berging / tank","Stockage / citerne minimum","Almacenamiento / depósito mínimo"],
maxThrottle:["Maximum controlled discharge","Максимальний дросельований скид","Maximaler Drosselabfluss","Maximaal geknepen debiet","Débit régulé maximal","Caudal regulado máximo"],
drainDown:["Drain-down time","Час спорожнення","Entleerungszeit","Ledigingstijd","Temps de vidange","Tiempo de vaciado"],
controlledDepth:["Controlled water depth","Керована глибина води","Kontrollierte Wasserhöhe","Gecontroleerde waterdiepte","Hauteur d’eau contrôlée","Calado controlado"],
minDrainCount:["Minimum roof-drain count","Мінімальна кількість водоприймачів","Mindestzahl Dachabläufe","Minimum aantal dakafvoeren","Nombre minimal d’avaloirs","Número mínimo de sumideros"],
drainEdge:["Drain distance to roof edge","Відстань водоприймача до краю","Abstand Ablauf–Dachrand","Afstand afvoer–dakrand","Distance avaloir–bord de toiture","Distancia sumidero–borde"],
drainSpacing:["Adjacent-drain spacing","Відстань між сусідніми водоприймачами","Abstand benachbarter Abläufe","Afstand tussen naburige afvoeren","Espacement entre avaloirs","Separación entre sumideros"],
emergencyCapacity:["Emergency/secondary target","Ціль аварійного/вторинного відводу","Ziel Not-/Sekundärentwässerung","Doel nood-/secundaire afvoer","Cible évacuation de secours","Objetivo drenaje de emergencia"],
roofSlope:["Roof slope","Ухил покрівлі","Dachgefälle","Dakhelling","Pente de toiture","Pendiente de cubierta"],
rainReference:["Rainfall reference","Референсний дощ","Regenreferenz","Regenreferentie","Référence de pluie","Referencia de lluvia"],
wallRule:["Vertical-wall contribution","Внесок вертикальних стін","Vertikalwand-Beitrag","Bijdrage verticale wand","Contribution des murs verticaux","Aporte de muros verticales"],
pumpDelay:["Release/pump start delay","Затримка пуску скиду/насоса","Startverzögerung Drossel/Pumpe","Startvertraging afvoer/pomp","Retard de démarrage rejet/pompe","Retardo de arranque descarga/bomba"],
pumpLimit:["Pump/discharge limit","Ліміт насоса/скиду","Pumpen-/Abflussgrenze","Pomp-/afvoerlimiet","Limite pompe/rejet","Límite bomba/descarga"],
interception5:["First 5 mm interception potential","Потенціал перехоплення перших 5 мм","Potenzial für 5-mm-Rückhalt","Potentieel voor eerste 5 mm","Potentiel d’interception des 5 premiers mm","Potencial de interceptación de 5 mm"],
capacityFactor:["Drain reliability factor","Коефіцієнт надійності водостоку","Zuverlässigkeitsbeiwert Ablauf","Betrouwbaarheidsfactor afvoer","Coefficient de fiabilité d’évacuation","Factor de fiabilidad del desagüe"],
scenarioBasis:["Scenario basis","Основа сценарію","Szenariobasis","Scenariobasis","Base du scénario","Base del escenario"],
conditional:["conditional","умовно","bedingt","voorwaardelijk","conditionnel","condicional"],
notChecked:["not checked","не перевіряється","nicht geprüft","niet gecontroleerd","non vérifié","no comprobado"],
criticalDuration:["Critical-duration search requires an IDF series, not one intensity.","Пошук критичної тривалості потребує IDF-ряду, а не однієї інтенсивності.","Die kritische Dauer erfordert eine IDF-Reihe, nicht nur eine Intensität.","Zoeken naar de kritieke duur vereist een IDF-reeks, niet één intensiteit.","La durée critique exige une série IDF, pas une seule intensité.","La duración crítica requiere una serie IDF, no una sola intensidad."],
idfLocal:["location-specific IDF / design-rain data","локальні IDF / дані розрахункового дощу","ortsbezogene IDF-/Bemessungsregendaten","locatiespecifieke IDF-/ontwerpregendata","données IDF / pluie de projet locales","datos IDF / lluvia de diseño locales"],
allPrimaryToTank:["Primary drains routed to storage","Основні водоприймачі направлені в накопичувач","Hauptabläufe zum Speicher geführt","Primaire afvoeren naar berging","Avaloirs principaux vers stockage","Sumideros principales hacia almacenamiento"],
releaseDelay:["Release delay (min)","Затримка скиду (хв)","Abflussverzögerung (min)","Afvoervertraging (min)","Retard de rejet (min)","Retardo de descarga (min)"],
codeChecks:["Code-profile checks","Перевірки нормативного профілю","Regelwerksprüfungen","Normprofielcontroles","Contrôles du profil normatif","Comprobaciones del perfil normativo"],
generalChecks:["Physical checks","Фізичні перевірки","Physikalische Prüfungen","Fysische controles","Contrôles physiques","Comprobaciones físicas"],
sourceNote:["Public-source checks are a subset of the cited rules, not a complete compliance certificate.","Перевірки за відкритими первинними джерелами охоплюють лише частину вимог і не є повним сертифікатом відповідності.","Prüfungen aus öffentlichen Primärquellen decken nur einen Teil der Anforderungen ab und sind kein vollständiger Konformitätsnachweis.","Controles uit openbare primaire bronnen dekken slechts een deel van de eisen en zijn geen volledig conformiteitsbewijs.","Les contrôles issus de sources primaires publiques ne couvrent qu’une partie des exigences et ne constituent pas une attestation complète de conformité.","Las comprobaciones de fuentes primarias públicas cubren solo parte de los requisitos y no constituyen una certificación completa."],
presetExample:["Example preset — replace rainfall with project data.","Приклад пресету — замініть дощ проєктними даними.","Beispiel-Preset — Regen durch Projektdaten ersetzen.","Voorbeeldpreset — vervang regen door projectgegevens.","Préréglage d’exemple — remplacer la pluie par les données du projet.","Preajuste de ejemplo — sustituya la lluvia por datos del proyecto."],
currentEvent:["Current event","Поточна подія","Aktuelles Ereignis","Huidige gebeurtenis","Événement courant","Evento actual"],
profileMaturity:["Profile maturity","Зрілість профілю","Reifegrad Profil","Profielstatus","Maturité du profil","Madurez del perfil"],
item:["Item","Позиція","Punkt","Item","Élément","Elemento"],
value:["Value","Значення","Wert","Waarde","Valeur","Valor"],
status:["Status","Статус","Status","Status","Statut","Estado"],
quantity:["Quantity","Величина","Größe","Grootheid","Grandeur","Magnitud"],
result:["Result","Результат","Ergebnis","Resultaat","Résultat","Resultado"],
scene3d:["3D catchment scene","3D-сцена водозбору","3D-Einzugsgebiet","3D-wateropvangscene","Scène 3D du bassin versant","Escena 3D de captación"],
hydrograph:["Hydrograph","Гідрограф","Hydrograph","Hydrograaf","Hydrogramme","Hidrograma"],
windRoseTitle:["Wind exposure rose","Роза вітрового дощу","Windregenrose","Windregenroos","Rose d’exposition au vent","Rosa de lluvia con viento"],
minuteTable:["Minute-by-minute retention table","Похвилинна таблиця накопичення","Minutengenaue Rückhaltetabelle","Minuut-tot-minuut retentietabel","Table de rétention minute par minute","Tabla de retención minuto a minuto"],
rainInflow:["Rain inflow","Приплив дощу","Regenzufluss","Regeninstroom","Apport de pluie","Entrada de lluvia"],
roofStorage:["Roof storage","Накопичення на покрівлі","Dachspeicher","Dakberging","Stockage toiture","Almacenamiento en cubierta"],
copyWord:["copy","копія","Kopie","kopie","copie","copia"],
flandersInfRef:["Reference infiltration buffer","Референсний інфільтраційний буфер","Referenz-Versickerungsspeicher","Referentie-infiltratiebuffer","Tampon d’infiltration de référence","Volumen de infiltración de referencia"],
flandersAreaNote:["A < 1000 m² · the area condition of art. 9 is not triggered by area alone","A < 1000 м² · умова за площею ст. 9 сама по собі не спрацьовує","A < 1000 m² · die Flächenbedingung aus Art. 9 wird nicht allein durch die Fläche ausgelöst","A < 1000 m² · de oppervlaktevoorwaarde van art. 9 wordt niet alleen door de oppervlakte geactiveerd","A < 1000 m² · la condition de surface de l’art. 9 n’est pas déclenchée par la seule surface","A < 1000 m² · la condición de superficie del art. 9 no se activa solo por el área"],
brusselsEnhanced:["50 l/m² = enhanced sizing for a bare roof; green-roof exclusions require project data","50 л/м² = підвищений об’єм для голої покрівлі; винятки для зеленої покрівлі потребують проєктних даних","50 l/m² = erhöhte Bemessung für ein unbegrüntes Dach; Gründach-Ausnahmen benötigen Projektdaten","50 l/m² = ruimere dimensionering voor een kaal dak; uitzonderingen voor groendaken vereisen projectgegevens","50 l/m² = dimensionnement renforcé pour toiture nue ; les exclusions de toiture verte exigent les données du projet","50 l/m² = dimensionado reforzado para cubierta desnuda; las exclusiones de cubierta verde requieren datos del proyecto"],
primaryFlow:["Normal drainage boundary flow","Гранична витрата штатного водовідводу","Randabfluss Normalentwässerung","Randdebiet normale afvoer","Débit limite évacuation normale","Caudal límite de drenaje normal"],
emergencyFlow:["Emergency overflow flow","Витрата аварійного переливу","Notüberlauf-Abfluss","Debiet noodoverstort","Débit trop-plein d’urgence","Caudal rebosadero de emergencia"],
tankSewerFlow:["Tank → sewer","Резервуар → каналізація","Speicher → Kanal","Tank → riool","Réservoir → égout","Depósito → alcantarillado"],
emergencyState:["Emergency state","Стан аварійного переливу","Notentwässerung","Noodafvoerstatus","État du trop-plein","Estado de emergencia"],
inactive:["inactive","неактивний","inaktiv","inactief","inactif","inactivo"],
active:["ACTIVE","АКТИВНИЙ","AKTIV","ACTIEF","ACTIF","ACTIVO"],
firstEmergency:["Emergency starts","Початок аварійного переливу","Notüberlauf ab","Noodoverstort vanaf","Début trop-plein","Inicio rebosadero"],
overflowGeometry:["Emergency openings","Аварійні отвори","Notüberlauföffnungen","Noodoverstortopeningen","Ouvertures de secours","Aberturas de emergencia"],
overflowCount:["Opening count","Кількість отворів","Anzahl Öffnungen","Aantal openingen","Nombre d’ouvertures","Número de aberturas"],
overflowDiameter:["Opening diameter (mm)","Діаметр отвору (мм)","Öffnungsdurchmesser (mm)","Diameter opening (mm)","Diamètre ouverture (mm)","Diámetro abertura (mm)"],
overflowShape:["Opening geometry","Геометрія отвору","Öffnungsgeometrie","Geometrie opening","Géométrie de l’ouverture","Geometría de abertura"],
circular:["Circular opening","Круглий отвір","Runde Öffnung","Ronde opening","Ouverture circulaire","Abertura circular"],
rectangular:["Rectangular scupper","Прямокутний перелив","Rechteckiger Speier","Rechthoekige noodoverstort","Trop-plein rectangulaire","Rebosadero rectangular"],
overflowWidth:["Opening width (mm)","Ширина отвору (мм)","Öffnungsbreite (mm)","Breedte opening (mm)","Largeur ouverture (mm)","Ancho abertura (mm)"],
overflowHeight:["Opening height (mm)","Висота отвору (мм)","Öffnungshöhe (mm)","Hoogte opening (mm)","Hauteur ouverture (mm)","Alto abertura (mm)"],
requiredWidth:["Required width with current count","Потрібна ширина при поточній кількості","Erforderliche Breite bei aktueller Anzahl","Benodigde breedte bij huidig aantal","Largeur requise avec le nombre actuel","Ancho requerido con la cantidad actual"],
normalDrainScope:["Normal drainage hydraulics is outside this tool. Enter the verified available flow from the separate gravity/siphonic drainage design.","Гідравліка штатного водовідводу поза межами цієї тулзи. Введіть перевірену доступну витрату з окремого розрахунку гравітаційної/сифонної системи.","Die Hydraulik der Normalentwässerung liegt außerhalb dieses Tools. Geben Sie den nachgewiesenen verfügbaren Abfluss aus der separaten Freispiegel-/Druckströmungsbemessung ein.","De hydraulica van de normale dakafvoer valt buiten deze tool. Voer het geverifieerde beschikbare debiet uit de aparte zwaartekracht-/sifonberekening in.","L’hydraulique de l’évacuation normale est hors périmètre. Saisissez le débit disponible vérifié par le calcul séparé gravitaire/siphonique.","La hidráulica del drenaje normal queda fuera de esta herramienta. Introduzca el caudal disponible verificado por el cálculo separado gravitatorio/sifónico."],
externalBoundary:["external boundary","зовнішня гранична умова","externe Randbedingung","externe randvoorwaarde","condition limite externe","condición de contorno externa"],
overflowCd:["Discharge coefficient Cd","Коефіцієнт витрати Cd","Abflussbeiwert Cd","Afvoercoëfficiënt Cd","Coefficient de débit Cd","Coeficiente de descarga Cd"],
overflowSill:["Opening invert above roof (mm)","Низ отвору над покрівлею (мм)","Unterkante über Dach (mm)","Onderkant boven dak (mm)","Sous-face au-dessus toiture (mm)","Borde inferior sobre cubierta (mm)"],
pipeDiameter:["Downpipe diameter (mm)","Діаметр стояка (мм)","Fallrohrdurchmesser (mm)","Diameter standleiding (mm)","Diamètre descente (mm)","Diámetro bajante (mm)"],
capacityAtParapet:["Capacity at parapet crest","Пропускна здатність при рівні парапету","Leistung bei Attikaoberkante","Capaciteit bij opstandhoogte","Capacité au niveau de l’acrotère","Capacidad al nivel del peto"],
requiredEmergency:["Required emergency flow · current storm","Потрібний аварійний потік · поточний дощ","Erforderlicher Notabfluss · aktueller Regen","Benodigde noodafvoer · huidige bui","Débit de secours requis · pluie actuelle","Caudal de emergencia requerido · lluvia actual"],
requiredOpenings:["Required openings","Потрібно отворів","Erforderliche Öffnungen","Benodigde openingen","Ouvertures requises","Aberturas requeridas"],
requiredDiameter:["Required Ø with current count","Потрібний Ø при поточній кількості","Erforderlicher Ø bei aktueller Anzahl","Benodigde Ø bij huidig aantal","Ø requis avec le nombre actuel","Ø requerido con cantidad actual"],
play:["Play","Відтворити","Abspielen","Afspelen","Lecture","Reproducir"],
pause:["Pause","Пауза","Pause","Pauze","Pause","Pausa"],
timeline:["Storm timeline","Шкала часу дощу","Regen-Zeitachse","Bui-tijdlijn","Chronologie de pluie","Cronología de tormenta"],
sewer:["sewer","каналізація","Kanal","riool","égout","alcantarillado"],
primaryToTank:["primary → tank","основний → резервуар","Hauptablauf → Speicher","primair → tank","principal → réservoir","principal → depósito"],
primaryDirect:["primary → site drain","основний → зовнішній водовідвід","Hauptablauf → Kanal","primair → terreinriolering","principal → réseau","principal → red"],
tankThrottleOnly:["Controlled discharge to sewer","Дросельований скид у каналізацію","Gedrosselter Abfluss zum Kanal","Geknepen lozing naar riool","Rejet régulé vers égout","Descarga regulada a alcantarillado"],
reuseVolume:["Reuse volume","Об’єм повторного використання","Nutzungsvolumen","Hergebruiksvolume","Volume réutilisé","Volumen reutilizado"],
throttleVolume:["Sewer discharge volume","Об’єм скиду в каналізацію","Kanal-Abflussvolumen","Rioollozingsvolume","Volume rejeté à l’égout","Volumen descargado a alcantarillado"],
engineeringReality:["Drainage routing","Маршрутизація води","Entwässerungswege","Afvoerroutering","Cheminement hydraulique","Rutas hidráulicas"],
uaLowPoint:["drains within 10 mm of the modelled low point","водоприймачів у межах 10 мм від змодельованої нижньої точки","Abläufe innerhalb 10 mm des modellierten Tiefpunkts","afvoeren binnen 10 mm van het gemodelleerde laagste punt","avaloirs à moins de 10 mm du point bas modélisé","sumideros a menos de 10 mm del punto bajo modelado"]

};

const FEATURE_TEXT={
localRain:["local rain","локальний дощ","lokaler Regen","lokale regen","pluie locale","lluvia local"],
retention:["retention / storage","утримання / накопичення","Rückhalt / Speicherung","retentie / berging","rétention / stockage","retención / almacenamiento"],
ponding:["structural ponding","конструктивне накопичення","Wasserakkumulation","wateraccumulatie","accumulation structurelle","acumulación estructural"],
blockedPrimary:["blocked primary","відмова основного водовідводу","Ausfall Hauptentwässerung","uitval primaire afvoer","défaillance évacuation principale","fallo drenaje principal"],
secondarySame:["secondary = primary design rain","вторинний = дощ основної системи","Sekundär = Bemessungsregen Primär","secundair = ontwerpregen primair","secondaire = pluie de calcul primaire","secundario = lluvia de diseño primaria"],
flowControl:["flow-control roof drains","регульовані водоприймачі","Drossel-Dachabläufe","debietgeregelde dakafvoeren","avaloirs à débit contrôlé","sumideros de caudal controlado"],
wallContribution:["vertical-wall contribution","внесок вертикальних стін","Vertikalwand-Beitrag","bijdrage verticale wand","apport des murs verticaux","aporte de muros verticales"],
drainCount:["roof-drain count","кількість водоприймачів","Anzahl Dachabläufe","aantal dakafvoeren","nombre d’avaloirs","número de sumideros"],
interception:["small-rain interception","перехоплення малого дощу","Interzeption kleiner Regen","interceptie kleine buien","interception des petites pluies","interceptación de lluvias pequeñas"],
regional:["regional stormwater rules","регіональні правила дощових вод","regionale Regenwasserregeln","regionale hemelwaterregels","règles régionales eaux pluviales","reglas regionales de pluviales"],
reliability:["drain reliability factor","коефіцієнт надійності водостоку","Zuverlässigkeitsbeiwert Ablauf","betrouwbaarheidsfactor afvoer","coefficient de fiabilité","factor de fiabilidad"]
};

const PACK_STATUS_TEXT={
rules:["public-source rules","правила з первинних джерел","Regeln aus Primärquellen","regels uit primaire bronnen","règles de source primaire","reglas de fuente primaria"],
framework:["framework only","лише структура","nur Regelwerksrahmen","alleen raamwerk","cadre seulement","solo marco"]
};
const BASIS_TEXT={
de:["KOSTRA-DWD-2020 · r(D,T) · location-specific","KOSTRA-DWD-2020 · r(D,T) · за місцем","KOSTRA-DWD-2020 · r(D,T) · ortsbezogen","KOSTRA-DWD-2020 · r(D,T) · locatiegebonden","KOSTRA-DWD-2020 · r(D,T) · local","KOSTRA-DWD-2020 · r(D,T) · local"],
nl:["Project design rain; emergency structural scenario assumes regular drainage unavailable.","Проєктний розрахунковий дощ; аварійний конструктивний сценарій приймає недоступність штатного водовідводу.","Projekt-Bemessungsregen; im konstruktiven Notfall wird die reguläre Entwässerung als nicht verfügbar angesetzt.","Ontwerpregen van het project; in het constructieve noodscenario is de reguliere afvoer niet beschikbaar.","Pluie de projet ; le scénario structurel d’urgence suppose l’évacuation normale indisponible.","Lluvia de proyecto; el escenario estructural de emergencia supone indisponible el drenaje normal."],
us:["100-year, 1-hour rainfall or approved local weather data.","100-річний 1-годинний дощ або затверджені локальні метеодані.","100-jähriger 1-Stunden-Regen oder genehmigte lokale Wetterdaten.","100-jarige 1-uursregen of goedgekeurde lokale weerdata.","Pluie centennale sur 1 h ou données météo locales approuvées.","Lluvia de 100 años y 1 hora o datos meteorológicos locales aprobados."],
ca:["Flow-control drains: local 25-year IDF; scupper check uses 15-minute rainfall intensity.","Регульовані водоприймачі: локальні IDF 25-річної повторюваності; перевірка скапперів — за 15-хвилинною інтенсивністю.","Drosselabläufe: lokale 25-jährige IDF; Speierprüfung mit 15-min-Regenintensität.","Debietgeregelde afvoeren: lokale 25-jaars-IDF; spuwers met 15-minutenintensiteit.","Avaloirs à débit contrôlé : IDF locale 25 ans ; contrôle des gargouilles sur 15 min.","Sumideros de caudal controlado: IDF local de 25 años; rebosaderos con intensidad de 15 min."],
uk:["England SuDS: first 5 mm interception; 1% AEP event and critical duration for extreme runoff.","SuDS Англії: перші 5 мм перехоплення; подія AEP 1% і критична тривалість для екстремального стоку.","England-SuDS: erste 5 mm Interzeption; 1-%-AEP-Ereignis und kritische Dauer für Extremabfluss.","Engeland SuDS: eerste 5 mm interceptie; 1% AEP en kritieke duur voor extreme afvoer.","SuDS Angleterre : interception des 5 premiers mm ; événement AEP 1 % et durée critique.","SuDS Inglaterra: interceptación de los primeros 5 mm; evento AEP 1% y duración crítica."],
es:["CTE DB HS 5 tables use 100 mm/h reference; local intensity applies f = i/100.","Таблиці CTE DB HS 5 базуються на 100 мм/год; для місцевої інтенсивності застосовується f = i/100.","CTE DB HS 5 verwendet 100 mm/h als Tabellenreferenz; lokal gilt f = i/100.","CTE DB HS 5 gebruikt 100 mm/h als tabelreferentie; lokaal geldt f = i/100.","Les tableaux CTE DB HS 5 utilisent 100 mm/h ; localement f = i/100.","Las tablas CTE DB HS 5 usan 100 mm/h; para intensidad local se aplica f = i/100."],
ar:["Design rain recurrence ≥ 50 years; retention calculation is minute-by-minute.","Повторюваність розрахункового дощу ≥ 50 років; накопичення рахується похвилинно.","Bemessungsregen mit Wiederkehrzeit ≥ 50 Jahre; Rückhalt minutengenau.","Ontwerpregen herhalingstijd ≥ 50 jaar; retentie minuut voor minuut.","Pluie de projet de période ≥ 50 ans ; rétention calculée minute par minute.","Lluvia de diseño con recurrencia ≥ 50 años; retención minuto a minuto."],
be_fl:["Flanders 2023 Hemelwaterverordening; storage/discharge rules depend on infiltration feasibility and contributing area.","Hemelwaterverordening Фландрії 2023; об’єм/скид залежать від можливості інфільтрації та площі водозбору.","Flämische Hemelwaterverordening 2023; Speicher/Abfluss hängen von Versickerbarkeit und Einzugsfläche ab.","Vlaamse Hemelwaterverordening 2023; berging/lozing hangen af van infiltratiemogelijkheid en afwaterende oppervlakte.","Hemelwaterverordening flamande 2023 ; stockage/rejet selon infiltrabilité et surface contributive.","Hemelwaterverordening flamenca 2023; almacenamiento/vertido según infiltración y área contribuyente."],
be_bru:["Brussels: rainwater-reuse cistern based on horizontal roof projection; parcel buffering is calculator/project specific.","Брюссель: резервуар повторного використання за горизонтальною проєкцією даху; буфер ділянки визначається калькулятором/проєктом.","Brüssel: Regenwassernutzungszisterne nach horizontaler Dachprojektion; Grundstückspuffer projekt-/rechnerabhängig.","Brussel: hergebruiksciterne op horizontale dakprojectie; perceelbuffer is calculator-/projectspecifiek.","Bruxelles : citerne de réutilisation selon projection horizontale ; tampon parcellaire selon calculateur/projet.","Bruselas: cisterna de reutilización según proyección horizontal; amortiguación de parcela según calculador/proyecto."],
ua:["Project rainfall per applicable drainage standard; current roof DBN applies a 0.7 reliability factor to internal drains in non-dusty conditions.","Проєктний дощ за застосовним стандартом водовідведення; чинний ДБН покриттів застосовує коефіцієнт надійності 0,7 для внутрішніх водостоків у незапорошених умовах.","Projektregen nach anwendbarer Entwässerungsnorm; der aktuelle Dach-DBN verwendet 0,7 als Zuverlässigkeitsbeiwert für Innenentwässerung bei nicht staubiger Umgebung.","Ontwerpregen volgens toepasselijke afvoernorm; de huidige dak-DBN gebruikt factor 0,7 voor interne afvoer in niet-stoffige omgeving.","Pluie de projet selon la norme applicable ; le DBN toiture actuel applique 0,7 aux évacuations intérieures en atmosphère non poussiéreuse.","Lluvia de proyecto según la norma aplicable; el DBN de cubiertas vigente aplica 0,7 al drenaje interior en ambiente no polvoriento."],
generic:["Use the project/location design rainfall required by the cited national/local rules.","Використовуйте розрахунковий дощ проєкту/місця за наведеними національними/локальними правилами.","Projekt-/ortsbezogenen Bemessungsregen nach den genannten Regeln verwenden.","Gebruik de ontwerpregen van project/locatie volgens de genoemde regels.","Utiliser la pluie de projet/localisation imposée par les règles citées.","Use la lluvia de proyecto/localización exigida por las reglas citadas."]
};
const PACKS={
DE:{name:"Germany · DIN 1986-100 / KOSTRA-DWD",sc:["normal","extreme","retention"],def:{rain:null,duration:5},tier:"framework",basis:"de",features:["localRain","retention"],sources:["DWD · KOSTRA-DWD-2020 (2023)","DIN 1986-100:2016-12","E DIN 1986-100:2025-06 · draft §14.4"]},
NL:{name:"Netherlands · Bbl / NEN-EN 1991-1-3",sc:["normal","blocked","extreme"],def:{rain:null,duration:10},tier:"rules",basis:"nl",features:["blockedPrimary","ponding"],sources:["IPLO · Noodafvoersysteem bij platte daken","NEN-EN 1991-1-3 / Dutch National Annex"]},
US:{name:"USA · IPC 2024",sc:["normal","extreme","blocked"],def:{rain:null,duration:60},tier:"rules",basis:"us",features:["localRain","secondarySame","blockedPrimary","ponding"],sources:["IPC 2024 · §§1101.7, 1105.2, 1106.1, 1108"]},
CA:{name:"Canada · NPC 2025",sc:["normal","retention","extreme"],def:{rain:null,duration:15},tier:"rules",basis:"ca",features:["flowControl","retention","ponding","drainCount"],sources:["National Plumbing Code of Canada 2025 · 2.4.10.4"]},
UK:{name:"United Kingdom · England SuDS overlay",sc:["normal","retention","extreme"],def:{rain:null,duration:60},tier:"rules",basis:"uk",features:["interception","retention","localRain"],sources:["GOV.UK · National standards for SuDS (2025)","BS EN 12056-3 · roof hydraulics layer"]},
ES:{name:"Spain · CTE DB HS 5",sc:["normal","extreme"],def:{rain:277.7778,duration:10},tier:"rules",basis:"es",features:["drainCount","localRain"],sources:["CTE DB HS 5 · §§4.2.1–4.2.4, table 4.6, Annex B"]},
AR:{name:"Argentina · Resolución 641/2023",sc:["normal","retention","extreme"],def:{rain:null,duration:60},tier:"rules",basis:"ar",features:["wallContribution","retention"],sources:["Resolución 641/2023 · §§5.8–5.9"]},
AT:{name:"Austria · ÖNORM B 2501:2025 + EN 12056-3",sc:["normal","extreme","retention"],def:{rain:null,duration:20},tier:"framework",basis:"generic",features:["localRain","retention"],sources:["Austrian Standards · ÖNORM B 2501:2025-02-01","ÖNORM EN 12056-3"]},
CH:{name:"Switzerland · SN 592 000:2024",sc:["normal","retention","extreme"],def:{rain:null,duration:30},tier:"framework",basis:"generic",features:["localRain","retention"],sources:["VSA · SN 592 000:2024","MeteoSwiss location-specific rainfall basis"]},
FR:{name:"France · NF DTU 60.11 P3",sc:["normal","extreme","retention"],def:{rain:null,duration:20},tier:"framework",basis:"generic",features:["localRain","retention"],sources:["AFNOR · NF DTU 60.11 P3"]},
"BE-FL":{name:"Belgium · Flanders · Hemelwaterverordening 2023",sc:["normal","retention","extreme"],def:{rain:null,duration:60},tier:"rules",basis:"be_fl",features:["regional","retention"],sources:["Vlaamse Codex · Hemelwaterverordening 2023 · arts. 7, 9"]},
"BE-BRU":{name:"Belgium · Brussels · rainwater reuse / parcel management",sc:["normal","retention","extreme"],def:{rain:null,duration:60},tier:"rules",basis:"be_bru",features:["regional","retention"],sources:["Bruxelles Environnement · Gestion des eaux de pluie"]},
"BE-WA":{name:"Belgium · Wallonia · local/project rules",sc:["normal","retention","extreme"],def:{rain:null,duration:60},tier:"framework",basis:"generic",features:["regional","localRain"],sources:["Regional / municipal project requirements · enter verified project values"]},
UA:{name:"Ukraine · DBN V.2.6-220:2017",sc:["normal","extreme","retention"],def:{rain:null,duration:20},tier:"rules",basis:"ua",features:["reliability","localRain"],sources:["ЄДЕССБ · ДБН В.2.6-220:2017 · §10.6–10.11"]}
};

const JUR_TEXT={
DE:["Germany","Німеччина","Deutschland","Duitsland","Allemagne","Alemania"],
NL:["Netherlands","Нідерланди","Niederlande","Nederland","Pays-Bas","Países Bajos"],
US:["USA","США","USA","VS","États-Unis","EE. UU."],
CA:["Canada","Канада","Kanada","Canada","Canada","Canadá"],
UK:["United Kingdom / England overlay","Велика Британія / шар Англії","Vereinigtes Königreich / England-Layer","Verenigd Koninkrijk / Engeland-laag","Royaume-Uni / couche Angleterre","Reino Unido / capa Inglaterra"],
ES:["Spain","Іспанія","Spanien","Spanje","Espagne","España"],
AR:["Argentina","Аргентина","Argentinien","Argentinië","Argentine","Argentina"],
AT:["Austria","Австрія","Österreich","Oostenrijk","Autriche","Austria"],
CH:["Switzerland","Швейцарія","Schweiz","Zwitserland","Suisse","Suiza"],
FR:["France","Франція","Frankreich","Frankrijk","France","Francia"],
"BE-FL":["Belgium · Flanders","Бельгія · Фландрія","Belgien · Flandern","België · Vlaanderen","Belgique · Flandre","Bélgica · Flandes"],
"BE-BRU":["Belgium · Brussels","Бельгія · Брюссель","Belgien · Brüssel","België · Brussel","Belgique · Bruxelles","Bélgica · Bruselas"],
"BE-WA":["Belgium · Wallonia","Бельгія · Валлонія","Belgien · Wallonien","België · Wallonië","Belgique · Wallonie","Bélgica · Valonia"],
UA:["Ukraine","Україна","Ukraine","Oekraïne","Ukraine","Ucrania"]
};
function jurText(k){return JUR_TEXT[k]?.[li()]||JUR_TEXT[k]?.[0]||k}
function packStandard(p){
  if(p.name.includes(" · "))return p.name.split(" · ").slice(p.name.startsWith("Belgium ·")?2:1).join(" · ");
  return p.name;
}

const COLORS={roof:[180,188,190],wall:[154,165,171],drain:"#263b4b",overflow:"#2189c9",tank:[75,130,158],catchment:[175,172,150],lowspot:[207,151,75],water:"rgba(44,151,222,.38)"};
let lang="en",scene=null,editor=null,last=null,lastTankReq=null,animationToken=0,currentSpatialFrame=null;
let rainProfiles={},currentRainJur=null,comparisonResults=[],comparisonModeLast="same";
const $=id=>document.getElementById(id);
const li=()=>LANGS.indexOf(lang);
const tr=k=>TXT[k]?.[li()]??TXT[k]?.[0]??k;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const num=(id,d=0)=>Number($(id)?.value)||d;
const rad=d=>d*Math.PI/180;
const wrap=d=>((d%360)+360)%360;
const fmt=(v,n=1)=>Number.isFinite(v)?Number(v).toFixed(n):"—";

function baseScene(kind="be"){
  const roof={id:1,type:"roof",shape:"box",name:"Main roof",pos:[0,0,0],size:[30,20,.22],rotZ:0,color:COLORS.roof,alpha:.62,locked:true,pickable:false,parapetMm:250,deadMm:3,runoffC:1,slopeXmmM:4,slopeYmmM:2,cellM:1.5,manningN:.035,structModel:"rigid",structRefDeflMm:10,structUpdateSec:10,structModes:3,structAlertMm:50};
  const tank={id:8,type:"tank",shape:"box",name:"Buffer tank",pos:[10,5,-2.8],size:[3,3,2.3],color:COLORS.tank,alpha:.78,capacityM3:25,initialM3:0,throttleLps:1.5,reuseLps:0,releaseDelayMin:0};
  const objects=[
    roof,
    {id:2,type:"wall",shape:"box",name:"West façade",pos:[-15,0,.22],size:[.22,20,6],rotZ:0,color:COLORS.wall,widthM:20,heightM:6,azimuthDeg:270,runoffC:.9,toRoof:true},
    {id:3,type:"drain",shape:"drain",name:"Drain A",pos:[-8,-4,.25],size:[.6,.6,.1],radius:.32,color:COLORS.drain,externalFlowLps:5,blockagePct:0,toTank:true},
    {id:4,type:"drain",shape:"drain",name:"Drain B",pos:[8,-4,.25],size:[.6,.6,.1],radius:.32,color:COLORS.drain,externalFlowLps:5,blockagePct:0,toTank:true},
    {id:5,type:"drain",shape:"drain",name:"Drain C",pos:[-8,4,.25],size:[.6,.6,.1],radius:.32,color:COLORS.drain,externalFlowLps:5,blockagePct:0,toTank:true},
    {id:6,type:"drain",shape:"drain",name:"Drain D",pos:[8,4,.25],size:[.6,.6,.1],radius:.32,color:COLORS.drain,externalFlowLps:5,blockagePct:0,toTank:true},
    {id:7,type:"overflow",shape:"overflow",name:"Emergency overflow",pos:[0,-10,.22],size:[3,.2,.2],rotZ:0,color:COLORS.overflow,count:2,openingShape:"circular",diameterMm:120,widthMm:300,heightMm:120,cd:.62,thresholdMm:90},
    tank,
    {id:11,type:"lowspot",shape:"box",name:"Local low spot",pos:[4,1,.235],size:[6,6,.035],color:COLORS.lowspot,alpha:.38,depthMm:18,radiusM:3}
  ];
  if(kind==="courtyard"){
    roof.size=[24,18,.22];roof.parapetMm=220;
    objects.splice(1,1,
      {id:2,type:"wall",shape:"box",name:"Tall west wall",pos:[-12,0,.22],size:[.22,18,12],color:COLORS.wall,widthM:18,heightM:12,azimuthDeg:270,runoffC:.95,toRoof:true},
      {id:9,type:"wall",shape:"box",name:"North wall",pos:[0,9,.22],size:[24,.22,8],color:COLORS.wall,widthM:24,heightM:8,azimuthDeg:0,runoffC:.9,toRoof:true}
    );
    tank.capacityM3=18;tank.pos=[8,5,-2.8];tank.throttleLps=1;
  }
  if(kind==="blue"){
    roof.size=[35,24,.22];roof.parapetMm=280;roof.deadMm=10;
    tank.capacityM3=40;tank.throttleLps=.8;tank.pos=[13,8,-2.8];
    for(const o of objects.filter(q=>q.type==="drain")){o.externalFlowLps=3.2;o.toTank=true;}
    objects.find(q=>q.type==="overflow").thresholdMm=120;
  }
  if(kind==="upper"){
    roof.size=[28,18,.22];
    objects.push({id:10,type:"catchment",shape:"box",name:"Upper terrace",pos:[-8,11,3.5],size:[10,7,.25],color:COLORS.catchment,areaM2:70,runoffC:1,toRoof:true});
  }
  if(kind==="ponding"){
    roof.size=[30,20,.22];roof.parapetMm=260;roof.deadMm=0;roof.slopeXmmM=0;roof.slopeYmmM=0;roof.cellM=2.5;roof.structModel="twoWay";roof.structRefDeflMm=30;roof.structUpdateSec=10;roof.structModes=3;roof.structAlertMm=60;
    for(let i=objects.length-1;i>=0;i--)if(["wall","tank","lowspot"].includes(objects[i].type))objects.splice(i,1);
    const ds=objects.filter(q=>q.type==="drain");for(let i=0;i<ds.length;i++){ds[i].pos=[(i%2?1:-1)*13,(i<2?-1:1)*8,.25];ds[i].externalFlowLps=4;ds[i].toTank=false;}
    const ov=objects.find(q=>q.type==="overflow");ov.thresholdMm=120;ov.count=2;ov.diameterMm=140;ov.cd=.62;
  }
  return {meta:{name:kind},objects};
}
function makeFlandersPreset(){
  const s=baseScene("blue"),r=s.objects.find(o=>o.type==="roof"),t=s.objects.find(o=>o.type==="tank");
  r.size=[40,25,.22];r.deadMm=4;r.slopeXmmM=4;r.slopeYmmM=2;r.cellM=2.5;t.capacityM3=43;t.throttleLps=.5;t.reuseLps=0;t.releaseDelayMin=0;
  return s;
}
function makeBrusselsPreset(){
  const s=baseScene("be"),r=s.objects.find(o=>o.type==="roof"),t=s.objects.find(o=>o.type==="tank");
  r.size=[30,20,.22];t.capacityM3=19.8;t.throttleLps=1.2;t.reuseLps=.15;t.releaseDelayMin=0;return s;
}
function makeCanadaPreset(){
  const s=baseScene("blue"),r=s.objects.find(o=>o.type==="roof"),t=s.objects.find(o=>o.type==="tank");
  r.size=[45,20,.22];r.parapetMm=180;r.cellM=2.5;t.capacityM3=55;t.throttleLps=2;t.releaseDelayMin=0;
  return s;
}
function makeSpainPreset(){
  const s=baseScene("be"),r=s.objects.find(o=>o.type==="roof");r.size=[30,15,.22];r.slopeXmmM=4;r.slopeYmmM=0;
  s.objects=s.objects.filter(o=>o.type!=="tank"&&o.type!=="wall"&&o.type!=="lowspot");
  return s;
}
function makeArgentinaPreset(){
  const s=baseScene("courtyard"),r=s.objects.find(o=>o.type==="roof"),t=s.objects.find(o=>o.type==="tank");
  r.size=[30,20,.22];t.capacityM3=35;t.throttleLps=4;t.reuseLps=0;t.releaseDelayMin=10;return s;
}
function makeUkrainePreset(){
  const s=baseScene("be"),r=s.objects.find(o=>o.type==="roof");r.size=[30,20,.22];r.slopeXmmM=10;r.slopeYmmM=0;
  s.objects=s.objects.filter(o=>o.type!=="tank"&&o.type!=="wall"&&o.type!=="lowspot");
  for(const d of s.objects.filter(o=>o.type==="drain"))d.toTank=false;
  return s;
}
const PRESETS=[
{id:"be-fl",label:["Flanders · 1000 m² buffer case","Фландрія · буфер 1000 м²","Flandern · 1000-m²-Puffer","Vlaanderen · buffer 1000 m²","Flandre · tampon 1000 m²","Flandes · depósito 1000 m²"],jur:"BE-FL",event:{rain:300,duration:60,scenario:"retention"},make:makeFlandersPreset},
{id:"be-bru",label:["Brussels · 600 m² reuse cistern","Брюссель · цистерна 600 м²","Brüssel · 600-m²-Zisterne","Brussel · citerne 600 m²","Bruxelles · citerne 600 m²","Bruselas · cisterna 600 m²"],jur:"BE-BRU",event:{rain:250,duration:60,scenario:"retention"},make:makeBrusselsPreset},
{id:"ca-flow",label:["Canada · flow-control roof","Канада · регульована покрівля","Kanada · Drosseldach","Canada · debietgeregeld dak","Canada · toiture à débit contrôlé","Canadá · cubierta de caudal controlado"],jur:"CA",event:{rain:250,duration:15,scenario:"retention"},make:makeCanadaPreset},
{id:"es-450",label:["Spain · 450 m² flat roof","Іспанія · плоска покрівля 450 м²","Spanien · 450-m²-Flachdach","Spanje · plat dak 450 m²","Espagne · toiture plate 450 m²","España · cubierta plana 450 m²"],jur:"ES",event:{rain:277.7778,duration:10,scenario:"normal"},make:makeSpainPreset},
{id:"ar-retardo",label:["Argentina · walls + delayed release","Аргентина · стіни + затриманий скид","Argentinien · Wände + verzögerter Abfluss","Argentinië · wanden + vertraagde afvoer","Argentine · murs + rejet retardé","Argentina · muros + descarga retardada"],jur:"AR",event:{rain:300,duration:60,scenario:"retention"},make:makeArgentinaPreset},
{id:"ua-roof",label:["Ukraine · internal drainage example","Україна · приклад внутрішнього водостоку","Ukraine · Beispiel Innenentwässerung","Oekraïne · voorbeeld interne afvoer","Ukraine · exemple évacuation intérieure","Ucrania · ejemplo drenaje interior"],jur:"UA",event:{rain:300,duration:20,scenario:"normal"},make:makeUkrainePreset},
{id:"nl-ponding",label:["Netherlands · blocked primary + ponding","Нідерланди · відмова основного + ponding","Niederlande · Hauptablauf aus + Ponding","Nederland · primair geblokkeerd + wateraccumulatie","Pays-Bas · primaire bloquée + accumulation","Países Bajos · primario bloqueado + acumulación"],jur:"NL",event:{rain:500,duration:10,scenario:"blocked"},make:()=>baseScene("ponding")},
{id:"de-blue",label:["Germany · blue roof example","Німеччина · приклад blue roof","Deutschland · Blue-Roof-Beispiel","Duitsland · blauw-dakvoorbeeld","Allemagne · exemple toiture bleue","Alemania · ejemplo cubierta azul"],jur:"DE",event:{rain:300,duration:30,scenario:"retention"},make:()=>baseScene("blue")}
];

function roof(){return scene.objects.find(o=>o.type==="roof")}
function activeTank(){return scene.objects.find(o=>o.type==="tank")||null}
function nextId(){return scene.objects.reduce((m,o)=>Math.max(m,Number(o.id)||0),0)+1}
function normalizeWall(o){
  if(o.type!=="wall")return;
  o.size[0]=o.widthM||o.size[0]||5;o.size[1]=.22;o.size[2]=o.heightM||o.size[2]||4;
  o.rotZ=rad(180-(o.azimuthDeg||0));
}
function normalizeTank(o){
  if(o.type!=="tank")return;
  o.size=o.size||[3,3,2.3];o.alpha=o.alpha??.78;
  // Keep the complete tank below the roof slab; x/y remain editable.
  o.pos[2]=-Math.max(.5,o.size[2]+.5);
}
function snapOverflowToParapet(o){
  if(o.type!=="overflow")return;const r=roof();if(!r)return;
  o.count=Math.max(1,Math.round(o.count||1));o.diameterMm=Math.max(20,o.diameterMm||120);o.cd=clamp(o.cd??.62,.2,1);o.thresholdMm=Math.max(0,o.thresholdMm??90);
  const cx=r.pos?.[0]||0,cy=r.pos?.[1]||0,hx=r.size[0]/2,hy=r.size[1]/2,x=clamp(o.pos[0],cx-hx,cx+hx),y=clamp(o.pos[1],cy-hy,cy+hy);
  const d=[{e:"W",v:Math.abs(x-(cx-hx))},{e:"E",v:Math.abs(x-(cx+hx))},{e:"S",v:Math.abs(y-(cy-hy))},{e:"N",v:Math.abs(y-(cy+hy))}].sort((a,b)=>a.v-b.v)[0].e;
  if(d==="W"){o.pos[0]=cx-hx;o.pos[1]=y;o.rotZ=Math.PI/2;}else if(d==="E"){o.pos[0]=cx+hx;o.pos[1]=y;o.rotZ=Math.PI/2;}else if(d==="S"){o.pos[0]=x;o.pos[1]=cy-hy;o.rotZ=0;}else{o.pos[0]=x;o.pos[1]=cy+hy;o.rotZ=0;}
  o.edge=d;o.pos[2]=(r.pos?.[2]||0)+(r.size?.[2]||.22);
}
function normalizeEngineeringObjects(){for(const o of scene.objects){
  if(o.type==="wall")normalizeWall(o);
  if(o.type==="tank")normalizeTank(o);
  if(o.type==="drain"){
    if(o.externalFlowLps==null)o.externalFlowLps=Math.max(0,o.capacityLps||0);
    delete o.capacityLps;delete o.pipeDiameterMm;delete o.thresholdMm;
    o.pos[2]=(roof()?.pos?.[2]||0)+(roof()?.size?.[2]||.22)+.01;
  }
  if(o.type==="overflow"){
    o.openingShape=o.openingShape||"circular";
    o.widthMm=Math.max(20,o.widthMm||300);o.heightMm=Math.max(20,o.heightMm||120);
    snapOverflowToParapet(o);
  }
}}
function overflowFlowLps(o,freeSurfaceMm){
  const H=(freeSurfaceMm-(o.thresholdMm||0))/1000;if(H<=0)return 0;
  const Cd=clamp(o.cd??.62,.2,1),n=Math.max(1,Math.round(o.count||1)),shape=o.openingShape||"circular";
  if(shape==="rectangular"){
    const b=Math.max(.02,(o.widthMm||300)/1000),a=Math.max(.02,(o.heightMm||120)/1000),ymax=Math.min(a,H);
    const integ=(2/3)*Math.sqrt(2*9.80665)*(Math.pow(H,1.5)-Math.pow(Math.max(0,H-ymax),1.5));
    return Cd*n*b*integ*1000;
  }
  const D=Math.max(.02,(o.diameterMm||120)/1000),r=D/2,ymax=Math.min(D,H),N=24,dy=ymax/N;let integ=0;
  for(let i=0;i<=N;i++){const y=i*dy,width=2*Math.sqrt(Math.max(0,r*r-(y-r)*(y-r))),v=Math.sqrt(2*9.80665*Math.max(0,H-y)),f=width*v,w=(i===0||i===N)?1:(i%2?4:2);integ+=w*f;}
  return Cd*n*(dy/3)*integ*1000;
}
function emergencySizing(res,focus=null){
  if(!res)return null;
  const r=res.roof,limit=Math.max(0,r.parapetMm||0),overs=res.s.scene.objects.filter(o=>o.type==="overflow");
  const qReq=emergencyTargetFlow(res),qAvail=overs.reduce((a,o)=>a+overflowFlowLps(o,limit),0);let detail=null;
  if(focus){
    const others=overs.filter(o=>o.id!==focus.id).reduce((a,o)=>a+overflowFlowLps(o,limit),0),need=Math.max(0,qReq-others);
    const per=Math.max(1e-12,overflowFlowLps({...focus,count:1},limit)),nReq=Math.max(0,Math.ceil(need/per));
    let dReq=null,wReq=null;
    if((focus.openingShape||"circular")==="rectangular"){
      const qCurrent=Math.max(1e-12,overflowFlowLps({...focus,count:Math.max(1,focus.count||1)},limit));
      wReq=(focus.widthMm||300)*need/qCurrent;
    }else if(need>1e-9){
      let lo=20,hi=1500;for(let it=0;it<50;it++){const mid=(lo+hi)/2,q=overflowFlowLps({...focus,diameterMm:mid,count:Math.max(1,focus.count||1)},limit);if(q>=need)hi=mid;else lo=mid;}dReq=hi;
    }
    detail={perHole:per,nReq,dReq,wReq,need};
  }
  return{qReq,qAvail,actualHoles:overs.reduce((a,o)=>a+Math.max(1,Math.round(o.count||1)),0),detail};
}
function overflowSizingSummary(res){
  if(!res)return[];
  return res.s.scene.objects.filter(o=>o.type==="overflow").map(o=>{
    const z=emergencySizing(res,o),shape=o.openingShape||"circular";
    return{id:o.id,name:o.name||`#${o.id}`,shape,count:Math.max(1,Math.round(o.count||1)),sill_mm:o.thresholdMm||0,
      diameter_mm:shape==="circular"?(o.diameterMm||120):null,width_mm:shape==="rectangular"?(o.widthMm||300):null,height_mm:shape==="rectangular"?(o.heightMm||120):null,
      Cd:o.cd??.62,capacity_at_parapet_lps:overflowFlowLps(o,res.roof.parapetMm||0),
      required_total_lps:z.qReq,required_count_current_size:z.detail?.nReq??null,
      required_diameter_mm_current_count:z.detail?.dReq??null,required_width_mm_current_count:z.detail?.wReq??null};
  });
}
function syncRoofInputs(){
  const r=roof();if(!r)return;
  $("roofL").value=r.size[0];$("roofW").value=r.size[1];$("parapet").value=r.parapetMm??250;$("dead").value=r.deadMm??0;$("roofC").value=r.runoffC??1;
  $("slopeX").value=r.slopeXmmM??0;$("slopeY").value=r.slopeYmmM??0;$("cellSize").value=r.cellM??1.5;$("manning").value=r.manningN??.035;
  $("structModel").value=r.structModel||"rigid";$("structRef").value=r.structRefDeflMm??10;$("structUpdate").value=r.structUpdateSec??5;$("structModes").value=String(r.structModes??5);$("deflAlert").value=r.structAlertMm??50;
}
function pullRoofInputs(){
  const r=roof();if(!r)return;
  r.size[0]=Math.max(2,num("roofL",r.size[0]));r.size[1]=Math.max(2,num("roofW",r.size[1]));
  r.parapetMm=Math.max(0,num("parapet",r.parapetMm));r.deadMm=Math.max(0,num("dead",r.deadMm));r.runoffC=clamp(num("roofC",1),0,1.5);
  r.slopeXmmM=num("slopeX",r.slopeXmmM||0);r.slopeYmmM=num("slopeY",r.slopeYmmM||0);r.cellM=clamp(num("cellSize",r.cellM||1.5),.4,4);r.manningN=clamp(num("manning",r.manningN||.035),.01,.3);
  r.structModel=$("structModel")?.value||r.structModel||"rigid";r.structRefDeflMm=Math.max(0,num("structRef",r.structRefDeflMm||10));r.structUpdateSec=clamp(num("structUpdate",r.structUpdateSec||5),1,60);r.structModes=clamp(Math.round(num("structModes",r.structModes||5)),1,9);r.structAlertMm=Math.max(0,num("deflAlert",r.structAlertMm||50));
}
function defaultRainProfile(code){
  const p=PACKS[code], built=Number.isFinite(p?.def?.rain);
  return {rain:built?p.def.rain:300,duration:Math.max(1,p?.def?.duration||60),validRain:built,source:built?"code":"project",userEdited:false};
}
function rainProfile(code){return rainProfiles[code]||(rainProfiles[code]=defaultRainProfile(code));}
function rainReferenceLabel(code){const rp=rainProfile(code),p=PACKS[code];if(!rp.validRain)return tr("referenceMissing");return rp.source==="code"&&!rp.userEdited?tr("referenceCode"):tr("referenceProject");}
function saveRainControls(code=currentRainJur||$("jurisdiction")?.value){
  if(!code||!PACKS[code])return;const rp=rainProfile(code);
  if($("refRain")){rp.rain=Math.max(0,num("refRain",rp.rain));rp.duration=Math.max(1,num("refDuration",rp.duration));}
}
function loadRainControls(code,keepFactors=true){
  const rp=rainProfile(code), rf=keepFactors?Math.max(.01,num("rainFactor",1)):1, df=keepFactors?Math.max(.01,num("durationFactor",1)):1;
  if($("refRain")){$("refRain").value=rp.rain;$("refDuration").value=rp.duration;$("rainFactor").value=rf;$("durationFactor").value=df;$("rain").value=rp.rain*rf;$("duration").value=rp.duration*df;updateRainReferenceHint();}
  currentRainJur=code;
}
function updateRainReferenceHint(){
  if(!$("rainReferenceHint"))return;const code=$("jurisdiction").value,rp=rainProfile(code),p=PACKS[code];
  const src=rainReferenceLabel(code);$("rainReferenceHint").innerHTML=`<b>${tr("referenceSource")}:</b> ${src}${rp.validRain?` · ${fmt(rp.rain,1)} l/s·ha · ${fmt(rp.duration,0)} min`:""}<br>${packBasisText(p)}`;
}
function syncAppliedFromFactors(){
  const rp=rainProfile($("jurisdiction").value),rf=Math.max(.01,num("rainFactor",1)),df=Math.max(.01,num("durationFactor",1));
  $("rain").value=rp.rain*rf;$("duration").value=rp.duration*df;updateRainReferenceHint();
}
function syncFactorsFromApplied(){
  const rp=rainProfile($("jurisdiction").value);if(rp.rain>0)$("rainFactor").value=Math.max(.01,num("rain",rp.rain)/rp.rain);if(rp.duration>0)$("durationFactor").value=Math.max(.01,num("duration",rp.duration)/rp.duration);
}
function markReferenceEdited(){
  const code=$("jurisdiction").value,rp=rainProfile(code);rp.rain=Math.max(0,num("refRain",rp.rain));rp.duration=Math.max(1,num("refDuration",rp.duration));rp.validRain=rp.rain>0;rp.source="project";rp.userEdited=true;syncAppliedFromFactors();
}
function resetRainFactors(){if($("rainFactor"))$("rainFactor").value=1;if($("durationFactor"))$("durationFactor").value=1;syncAppliedFromFactors();run(false);}

function state(){
  pullRoofInputs();
  return {
    lang,jurisdiction:$("jurisdiction").value,scenario:$("scenario").value,
    rain:num("rain",300),duration:num("duration",60),dt:num("dt",2),
    referenceRain:num("refRain",num("rain",300)),referenceDuration:num("refDuration",num("duration",60)),rainFactor:num("rainFactor",1),durationFactor:num("durationFactor",1),rainProfiles:JSON.parse(JSON.stringify(rainProfiles)),
    windSpeed:num("windSpeed",8),windFrom:wrap(num("windFrom",240)),
    fallSpeed:Math.max(.5,num("fallSpeed",7)),windK:Math.max(0,num("windK",.6)),
    scene:JSON.parse(JSON.stringify({meta:scene.meta,objects:scene.objects.filter(o=>!o._dynamic)}))
  };
}
function setState(s){
  if(!s)return;
  if(s.lang&&LANGS.includes(s.lang)){lang=s.lang;$("lang").value=lang;}
  if(s.rainProfiles)rainProfiles=JSON.parse(JSON.stringify(s.rainProfiles));
  if(s.jurisdiction&&PACKS[s.jurisdiction])$("jurisdiction").value=s.jurisdiction;
  rebuildScenarios(s.scenario);
  loadRainControls($("jurisdiction").value,false);
  if(s.referenceRain!=null){const rp=rainProfile($("jurisdiction").value);rp.rain=s.referenceRain;rp.duration=s.referenceDuration??rp.duration;rp.validRain=rp.rain>0;rp.source=rp.source||"project";$("refRain").value=rp.rain;$("refDuration").value=rp.duration;}
  for(const k of ["rain","duration","dt","windSpeed","windFrom","fallSpeed","windK","rainFactor","durationFactor"])if(s[k]!=null&&$(k))$(k).value=s[k];
  if(s.scene){scene=JSON.parse(JSON.stringify(s.scene));normalizeEngineeringObjects();editor?.setScene(scene);}
  syncRoofInputs();applyI18n();renderObjectList();renderInspector(editor?.getSelected());run(false);
}

function primaryBoundaryFlow(s,o){
  if(s.scenario==="blocked")return 0;
  const q=Math.max(0,o.externalFlowLps??o.capacityLps??0);
  return q*(1-clamp(o.blockagePct??0,0,100)/100);
}
function primaryBoundaryTotal(s){return s.scene.objects.filter(o=>o.type==="drain").reduce((a,o)=>a+primaryBoundaryFlow(s,o),0);}
function emergencyTargetFlow(res){
  const qIn=Math.max(0,res.inc.total),code=res.s.jurisdiction;
  if(code==="US"||code==="NL")return qIn;
  if(code==="CA"&&Math.abs(res.s.duration-15)<.01)return 2*qIn;
  if(res.s.scenario==="blocked")return qIn;
  return Math.max(0,qIn-primaryBoundaryTotal(res.s));
}
function windToVec(fromDeg){const a=rad(wrap(fromDeg+180));return[Math.sin(a),Math.cos(a)];}
function normalVec(az){const a=rad(wrap(az));return[Math.sin(a),Math.cos(a)];}
function wallFactor(o,s,from=s.windFrom){
  if(!o.toRoof)return 0;
  const d=windToVec(from),n=normalVec(o.azimuthDeg||0),exposure=Math.max(0,-(d[0]*n[0]+d[1]*n[1]));
  return s.windK*s.windSpeed/Math.max(.5,s.fallSpeed)*exposure*(o.runoffC??.9);
}
function inflowComponents(s){
  const r=s.scene.objects.find(o=>o.type==="roof"),A=r.size[0]*r.size[1];
  const direct=s.rain*A/10000*(r.runoffC??1);let wall=0,upper=0;
  for(const o of s.scene.objects){
    if(o.type==="wall"&&o.toRoof){
      const area=(o.widthM||o.size[0])*(o.heightM||o.size[2]);
      wall+=s.rain*wallFactor(o,s)*area/10000;
    }else if(o.type==="catchment"&&o.toRoof){
      upper+=s.rain*(o.areaM2??o.size[0]*o.size[1])/10000*(o.runoffC??1);
    }
  }
  return{direct,wall,upper,total:direct+wall+upper};
}
function drainBlock(s,o){return s.scenario==="blocked"?100:(o.blockagePct??0);}

function buildSpatialGrid(s){
  const r=s.scene.objects.find(o=>o.type==="roof"),L=Math.max(2,r.size[0]),W=Math.max(2,r.size[1]);
  const target=clamp(r.cellM||1.5,.4,4),nx=clamp(Math.round(L/target),4,60),ny=clamp(Math.round(W/target),4,60);
  const dx=L/nx,dy=W/ny,Acell=dx*dy,N=nx*ny,cx=r.pos?.[0]||0,cy=r.pos?.[1]||0,x0=cx-L/2,y0=cy-W/2;
  const sx=(r.slopeXmmM||0)/1000,sy=(r.slopeYmmM||0)/1000,lows=s.scene.objects.filter(o=>o.type==="lowspot");
  const z=new Float64Array(N);let zmin=Infinity,zmax=-Infinity;
  for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
    const k=j*nx+i,x=x0+(i+.5)*dx,y=y0+(j+.5)*dy;let zz=sx*(x-cx)+sy*(y-cy);
    for(const o of lows){const rr=Math.max(.15,o.radiusM||2.5),dd=(o.depthMm||0)/1000,d2=(x-o.pos[0])**2+(y-o.pos[1])**2;zz-=dd*Math.exp(-.5*d2/(rr*rr));}
    z[k]=zz;zmin=Math.min(zmin,zz);zmax=Math.max(zmax,zz);
  }
  const pairs=[];for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const a=j*nx+i;if(i+1<nx)pairs.push({a,b:a+1,dist:dx,width:dy});if(j+1<ny)pairs.push({a,b:a+nx,dist:dy,width:dx});}
  const cellAt=(x,y)=>{const i=clamp(Math.floor((x-x0)/dx),0,nx-1),j=clamp(Math.floor((y-y0)/dy),0,ny-1);return j*nx+i;};
  const z0=new Float64Array(z);
  return{r,L,W,nx,ny,dx,dy,Acell,N,cx,cy,x0,y0,z0,z,zmin,zmax,pairs,cellAt};
}

function structuralBasis(grid,modes){
  const M=clamp(Math.round(modes||5),1,9),sx=[],sy=[];
  for(let m=1;m<=M;m++){const a=new Float64Array(grid.nx);for(let i=0;i<grid.nx;i++)a[i]=Math.sin(m*Math.PI*(i+.5)/grid.nx);sx.push(a);}
  for(let n=1;n<=M;n++){const a=new Float64Array(grid.ny);for(let j=0;j<grid.ny;j++)a[j]=Math.sin(n*Math.PI*(j+.5)/grid.ny);sy.push(a);}
  return{M,sx,sy};
}
function structuralResponseRaw(model,pressure,grid,basis,stiffness=1){
  const {M,sx,sy}=basis,w=new Float64Array(grid.N),L=grid.L,W=grid.W,A=grid.Acell;
  if(model==="rigid")return w;
  if(model==="oneX"){
    for(let j=0;j<grid.ny;j++){
      const coeff=new Float64Array(M);
      for(let mi=0;mi<M;mi++){let qm=0;for(let i=0;i<grid.nx;i++)qm+=pressure[j*grid.nx+i]*sx[mi][i]*grid.dx;qm*=2/L;const k=(mi+1)*Math.PI/L;coeff[mi]=qm/(Math.max(1e-18,stiffness)*k**4);}
      for(let i=0;i<grid.nx;i++){let ww=0;for(let mi=0;mi<M;mi++)ww+=coeff[mi]*sx[mi][i];w[j*grid.nx+i]=Math.max(0,ww);}
    }
    return w;
  }
  if(model==="oneY"){
    for(let i=0;i<grid.nx;i++){
      const coeff=new Float64Array(M);
      for(let ni=0;ni<M;ni++){let qn=0;for(let j=0;j<grid.ny;j++)qn+=pressure[j*grid.nx+i]*sy[ni][j]*grid.dy;qn*=2/W;const k=(ni+1)*Math.PI/W;coeff[ni]=qn/(Math.max(1e-18,stiffness)*k**4);}
      for(let j=0;j<grid.ny;j++){let ww=0;for(let ni=0;ni<M;ni++)ww+=coeff[ni]*sy[ni][j];w[j*grid.nx+i]=Math.max(0,ww);}
    }
    return w;
  }
  const coeff=Array.from({length:M},()=>new Float64Array(M));
  for(let mi=0;mi<M;mi++)for(let ni=0;ni<M;ni++){
    let qmn=0;for(let j=0;j<grid.ny;j++)for(let i=0;i<grid.nx;i++)qmn+=pressure[j*grid.nx+i]*sx[mi][i]*sy[ni][j]*A;
    qmn*=4/(L*W);const k2=((mi+1)*Math.PI/L)**2+((ni+1)*Math.PI/W)**2;coeff[mi][ni]=qmn/(Math.max(1e-18,stiffness)*k2*k2);
  }
  for(let j=0;j<grid.ny;j++)for(let i=0;i<grid.nx;i++){let ww=0;for(let mi=0;mi<M;mi++)for(let ni=0;ni<M;ni++)ww+=coeff[mi][ni]*sx[mi][i]*sy[ni][j];w[j*grid.nx+i]=Math.max(0,ww);}
  return w;
}
function prepareStructure(grid,r,forceRigid=false){
  const model=forceRigid?"rigid":(r.structModel||"rigid"),refMm=Math.max(0,r.structRefDeflMm||0),basis=structuralBasis(grid,r.structModes||5),w=new Float64Array(grid.N);
  if(model==="rigid"||refMm<=0)return{model:"rigid",basis,w,stiffness:Infinity,updateSec:Infinity,refMm:0,maxDeflMm:0,lastUpdate:-Infinity};
  const pref=new Float64Array(grid.N);pref.fill(1000);
  const unit=structuralResponseRaw(model,pref,grid,basis,1);let unitMax=0;for(const q of unit)unitMax=Math.max(unitMax,q);
  const stiffness=unitMax/Math.max(1e-9,refMm/1000);
  return{model,basis,w,stiffness,updateSec:clamp(r.structUpdateSec||5,1,60),refMm,maxDeflMm:0,lastUpdate:-Infinity};
}
function updateStructure(struct,V,grid,t,force=false){
  if(struct.model==="rigid")return 0;if(!force&&t-struct.lastUpdate<struct.updateSec-1e-9)return struct.maxDeflMm;
  const pressure=new Float64Array(grid.N);for(let k=0;k<grid.N;k++)pressure[k]=1000*9.80665*(V[k]/grid.Acell);
  const target=structuralResponseRaw(struct.model,pressure,grid,struct.basis,struct.stiffness);let mx=0;
  for(let k=0;k<grid.N;k++){struct.w[k]=target[k];grid.z[k]=grid.z0[k]-struct.w[k];mx=Math.max(mx,struct.w[k]*1000);}struct.maxDeflMm=mx;struct.lastUpdate=t;return mx;
}
function resetStructure(struct,grid){for(let k=0;k<grid.N;k++){struct.w[k]=0;grid.z[k]=grid.z0[k];}struct.maxDeflMm=0;struct.lastUpdate=-Infinity;}

function buildSourceField(s,grid){
  const field=new Float64Array(grid.N),r=grid.r,A=grid.L*grid.W,direct=s.rain*A/10000*(r.runoffC??1),qd=direct/grid.N;for(let k=0;k<grid.N;k++)field[k]+=qd;
  let wall=0,upper=0;
  for(const o of s.scene.objects){
    if(o.type==="wall"&&o.toRoof){
      const area=(o.widthM||o.size[0])*(o.heightM||o.size[2]),qKin=s.rain*wallFactor(o,s)*area/10000,qNorm=s.jurisdiction==="AR"?s.rain*.5*area/10000:0,q=Math.max(qKin,qNorm);wall+=q;
      const az=rad(wrap(o.azimuthDeg||0)),tx=Math.cos(az),ty=-Math.sin(az),ww=Math.max(.1,o.widthM||o.size[0]),ns=clamp(Math.ceil(ww/Math.max(.25,Math.min(grid.dx,grid.dy))),3,40);
      for(let m=0;m<ns;m++){const u=((m+.5)/ns-.5)*ww;field[grid.cellAt(o.pos[0]+tx*u,o.pos[1]+ty*u)]+=q/ns;}
    }else if(o.type==="catchment"&&o.toRoof){
      const q=s.rain*(o.areaM2??o.size[0]*o.size[1])/10000*(o.runoffC??1);upper+=q;
      for(let jj=0;jj<3;jj++)for(let ii=0;ii<3;ii++){const x=o.pos[0]+((ii+.5)/3-.5)*(o.size?.[0]||1),y=o.pos[1]+((jj+.5)/3-.5)*(o.size?.[1]||1);field[grid.cellAt(x,y)]+=q/9;}
    }
  }
  let total=0;for(const q of field)total+=q;return{field,direct,wall,upper,total};
}
function roofStats(V,grid){let Vr=0,maxH=0,flood=0,maxEdgeExcess=-Infinity;const depths=new Float32Array(grid.N),parapet=(grid.r.parapetMm||0)/1000;for(let j=0;j<grid.ny;j++)for(let i=0;i<grid.nx;i++){const k=j*grid.nx+i;Vr+=V[k];const hm=V[k]/grid.Acell,h=hm*1000;depths[k]=h;maxH=Math.max(maxH,h);if(h>10)flood+=grid.Acell;if(i===0||j===0||i===grid.nx-1||j===grid.ny-1){const excess=(grid.z[k]+hm)-(grid.z0[k]+parapet);maxEdgeExcess=Math.max(maxEdgeExcess,excess*1000);}}return{Vr,maxH,flood,depths,maxEdgeExcess:Number.isFinite(maxEdgeExcess)?maxEdgeExcess:-1e9};}
function mobileRoofVolume(V,grid,deadM){let v=0,base=deadM*grid.Acell;for(const q of V)v+=Math.max(0,q-base);return v;}
function redistributeRoof(V,grid,dt,nManning,deadM){
  const N=grid.N,A=grid.Acell,eta=new Float64Array(N),mobile=new Float64Array(N),out=new Float64Array(N),moves=[];
  for(let k=0;k<N;k++){const h=V[k]/A;mobile[k]=Math.max(0,h-deadM);eta[k]=grid.z[k]+h;}
  for(const p of grid.pairs){const de=eta[p.a]-eta[p.b];if(Math.abs(de)<1e-10)continue;const donor=de>0?p.a:p.b,recv=de>0?p.b:p.a,hd=mobile[donor];if(hd<=1e-7)continue;const slope=Math.max(0,Math.abs(de)/p.dist);if(slope<=0)continue;const q=(p.width/Math.max(.01,nManning))*Math.pow(hd,5/3)*Math.sqrt(slope),dv=q*dt;if(dv>0){moves.push({donor,recv,dv});out[donor]+=dv;}}
  const scale=new Float64Array(N);for(let k=0;k<N;k++){const avail=Math.max(0,V[k]-deadM*A);scale[k]=out[k]>0?Math.min(1,.45*avail/out[k]):1;}
  let moved=0;for(const m of moves){const dv=m.dv*scale[m.donor];V[m.donor]-=dv;V[m.recv]+=dv;moved+=dv;}return moved;
}
function removeFromCell(V,grid,idx,qLps,dt,deadM){if(qLps<=0)return 0;const avail=Math.max(0,V[idx]-deadM*grid.Acell),dv=Math.min(avail,qLps*dt/1000);V[idx]-=dv;return dv*1000/dt;}

function simulate(s,opts={}){
  const grid=buildSpatialGrid(s),r=grid.r,A=grid.L*grid.W,deadM=Math.max(0,r.deadMm||0)/1000,Vdead=A*deadM,structure=prepareStructure(grid,r,!!opts.forceRigid);
  const drains=s.scene.objects.filter(o=>o.type==="drain"),overs=s.scene.objects.filter(o=>o.type==="overflow"),tank=s.scene.objects.find(o=>o.type==="tank"),inc=buildSourceField(s,grid);
  const userDt=clamp(s.dt,.2,30),hydDt=Math.min(userDt,1),rainT=Math.max(60,s.duration*60),nManning=clamp(r.manningN||.035,.01,.3),V=new Float64Array(grid.N);let Vt=tank?Math.max(0,tank.initialM3||0):0;
  let maxH=0,maxVr=0,maxVt=Vt,maxFloodArea=0,maxDefl=0,maxEdgeExcess=-Infinity,peakP=0,peakE=0,peakSite=0,volDirect=0,volWall=0,volUpper=0,volE=0,volTankOverflow=0,volControlled=0,volThrottle=0,volReuse=0,volDirectPrimary=0,emergencyFirst=null,tankOverflowFirst=null,drainDown=null;
  const rows=[],maxT=Math.max(rainT+3600,48*3600),sampleEvery=Math.max(10,rainT/180);let lastSample=-1e99,t=0,quietRoofSec=0,roofSettled=false,lastRoofCheckT=0,lastRoofVr=null,lastRoofH=null,lastRoofW=null,stableRoofChecks=0;
  const drainCells=new Map(drains.map(o=>[o.id,grid.cellAt(o.pos[0],o.pos[1])])),overCells=new Map(overs.map(o=>[o.id,grid.cellAt(o.pos[0],o.pos[1])]));
  while(t<=maxT+1e-9){
    const spatialActive=t<rainT||!roofSettled,raining=t<rainT,dt=raining?hydDt:(spatialActive?Math.min(8,Math.max(userDt,3)):Math.min(30,Math.max(userDt,2)));
    if(raining){for(let k=0;k<grid.N;k++)V[k]+=inc.field[k]*dt/1000;volDirect+=inc.direct*dt/1000;volWall+=inc.wall*dt/1000;volUpper+=inc.upper*dt/1000;}
    const deflMm=spatialActive?updateStructure(structure,V,grid,t):structure.maxDeflMm;maxDefl=Math.max(maxDefl,deflMm);
    const moved=spatialActive?redistributeRoof(V,grid,dt,nManning,deadM):0;let qpTank=0,qpDirect=0,qe=0;const drainQ={},overflowQ={};
    for(const o of drains){const idx=drainCells.get(o.id),q0=primaryBoundaryFlow(s,o),q=removeFromCell(V,grid,idx,q0,dt,deadM);drainQ[o.id]=q;if(o.toTank&&tank)qpTank+=q;else qpDirect+=q;}
    for(const o of overs){const idx=overCells.get(o.id),hMm=V[idx]/grid.Acell*1000,freeSurfaceAboveOriginalMm=hMm+(grid.z[idx]-grid.z0[idx])*1000,q0=overflowFlowLps(o,freeSurfaceAboveOriginalMm),q=removeFromCell(V,grid,idx,q0,dt,deadM);overflowQ[o.id]=q;qe+=q;}
    if(qe>1e-9&&emergencyFirst==null)emergencyFirst=t;let qt=0,qr=0,qto=0;
    if(tank){Vt+=qpTank*dt/1000;const cap=opts.infiniteTank?1e12:Math.max(0,tank.capacityM3||0),releaseOn=t>=Math.max(0,tank.releaseDelayMin||0)*60;qt=releaseOn?Math.min(Math.max(0,tank.throttleLps||0),Vt*1000/dt):0;Vt-=qt*dt/1000;qr=releaseOn?Math.min(Math.max(0,tank.reuseLps||0),Vt*1000/dt):0;Vt-=qr*dt/1000;if(Vt>cap){const excess=Vt-cap;qto=excess*1000/dt;Vt=cap;if(tankOverflowFirst==null)tankOverflowFirst=t;}}
    const st=roofStats(V,grid),site=qpDirect+qe+qt+qto;maxH=Math.max(maxH,st.maxH);maxVr=Math.max(maxVr,st.Vr);maxVt=Math.max(maxVt,Vt);maxFloodArea=Math.max(maxFloodArea,st.flood);maxEdgeExcess=Math.max(maxEdgeExcess,st.maxEdgeExcess);peakP=Math.max(peakP,qpTank+qpDirect);peakE=Math.max(peakE,qe);peakSite=Math.max(peakSite,site);
    if(t>rainT&&t-lastRoofCheckT>=60){if(lastRoofVr!=null&&Math.abs(st.Vr-lastRoofVr)<1e-3&&Math.abs(st.maxH-lastRoofH)<.1&&Math.abs(deflMm-lastRoofW)<.1)stableRoofChecks++;else stableRoofChecks=0;lastRoofVr=st.Vr;lastRoofH=st.maxH;lastRoofW=deflMm;lastRoofCheckT=t;if(stableRoofChecks>=3)roofSettled=true;}
    volDirectPrimary+=qpDirect*dt/1000;volE+=qe*dt/1000;volTankOverflow+=qto*dt/1000;volThrottle+=qt*dt/1000;volReuse+=qr*dt/1000;volControlled+=(qt+qr)*dt/1000;
    if(t-lastSample>=sampleEvery||t===0){rows.push({t,h:st.maxH,w:deflMm,Vr:st.Vr,Vt,qin:raining?inc.total:0,qp:qpTank+qpDirect,qpTank,qpDirect,qe,site,qt,qr,qto,drainQ:{...drainQ},overflowQ:{...overflowQ},flood:st.flood,depths:st.depths,deflections:new Float32Array(structure.w)});lastSample=t;}
    if(t>rainT){
      const roofRate=moved/Math.max(dt,1e-9)+(qpTank+qpDirect+qe)/1000;quietRoofSec=roofRate<1e-6?quietRoofSec+dt:0;if(quietRoofSec>=120)roofSettled=true;
      if(roofSettled){
        if(!tank||Vt<1e-7){drainDown=t-rainT;break;}
        const releaseQ=Math.max(0,tank.throttleLps||0)+Math.max(0,tank.reuseLps||0),releaseAt=Math.max(0,tank.releaseDelayMin||0)*60;
        if(releaseQ<=1e-12)break;
        if(t>=releaseAt){
          // Roof inflow to the tank has ceased. With constant throttle/reuse the remaining tank drawdown is analytic.
          const tail=Vt*1000/releaseQ,remain=Vt,nTail=Math.min(48,Math.max(3,Math.ceil(tail/600)));
          const qtt=Math.max(0,tank.throttleLps||0),qrr=Math.max(0,tank.reuseLps||0);
          for(let ii=1;ii<=nTail;ii++){const tau=tail*ii/nTail,v=Math.max(0,remain-releaseQ*tau/1000),lastTail=ii===nTail;rows.push({t:t+tau,h:st.maxH,w:deflMm,Vr:st.Vr,Vt:v,qin:0,qp:0,qpTank:0,qpDirect:0,qe:0,site:lastTail?0:qtt,qt:lastTail?0:qtt,qr:lastTail?0:qrr,qto:0,drainQ:{},overflowQ:{},flood:st.flood,depths:st.depths,deflections:new Float32Array(structure.w)});}
          volThrottle+=remain*qtt/releaseQ;volReuse+=remain*qrr/releaseQ;volControlled+=remain;Vt=0;drainDown=(t-rainT)+tail;t+=tail;break;
        }
      }
    }
    t+=dt;
  }
  const stEnd=roofStats(V,grid);if(rows.at(-1)?.t<t-1e-9)rows.push({t,h:stEnd.maxH,w:structure.maxDeflMm,Vr:stEnd.Vr,Vt,qin:0,qp:0,qe:0,site:0,qt:0,qr:0,qto:0,flood:stEnd.flood,depths:stEnd.depths,deflections:new Float32Array(structure.w)});
  return{s,A,Vdead,inc,grid,structure,rows,maxH,maxVr,maxVt,maxFloodArea,maxDefl,maxEdgeExcess,peakP,peakE,peakSite,volDirect,volWall,volUpper,volE,volTankOverflow,volControlled,volThrottle,volReuse,volDirectPrimary,storedEnd:stEnd.Vr+Vt,emergencyFirst,tankOverflowFirst,drainDown,tank,roof:r,tEnd:t};
}
function requiredTank(s){return s.scene.objects.some(o=>o.type==="tank")?simulate(s,{infiniteTank:true}).maxVt:0;}
function worstWindDirection(){
  const s=state();let best={deg:0,q:-1};
  for(let deg=0;deg<360;deg+=5){const q=inflowComponents({...s,windFrom:deg}).wall;if(q>best.q)best={deg,q};}
  $("windFrom").value=best.deg;run(false);
}

function waterVisual(row){
  if(!editor)return;scene.objects=scene.objects.filter(o=>!o._dynamic);currentVisualRow=row;currentSpatialFrame=row&&last?.grid?{grid:last.grid,depths:row.depths,deflections:row.deflections}:null;
  const r=roof(),top=(r.pos?.[2]||0)+(r.size?.[2]||.22),ph=(r.parapetMm||0)/1000,th=.12,hx=r.size[0]/2,hy=r.size[1]/2,cx=r.pos?.[0]||0,cy=r.pos?.[1]||0;
  if(ph>0){const aux=[
    {pos:[cx-hx-th/2,cy,top],size:[th,r.size[1]+2*th,ph]},{pos:[cx+hx-th/2,cy,top],size:[th,r.size[1]+2*th,ph]},
    {pos:[cx,cy-hy-th/2,top],size:[r.size[0],th,ph]},{pos:[cx,cy+hy-th/2,top],size:[r.size[0],th,ph]}];
    aux.forEach((a,i)=>scene.objects.push({id:-200-i,type:"parapetVisual",shape:"box",_dynamic:true,pickable:false,pos:a.pos,size:a.size,color:[105,125,136],alpha:.34}));}
  const tank=activeTank();if(tank&&row&&row.Vt>0){const f=clamp(row.Vt/Math.max(.001,tank.capacityM3||1),0,1);scene.objects.push({id:-101,type:"tankwater",shape:"water",_dynamic:true,pickable:false,pos:[tank.pos[0],tank.pos[1],tank.pos[2]+.02],size:[tank.size[0]*.86,tank.size[1]*.86,tank.size[2]*f*.9],color:"rgba(42,153,220,.42)"});}editor.render();
}
function updateHud(row){
  if(!row)return;
  $("hTime").textContent=`${fmt(row.t/60,1)} min`;$("hDepth").textContent=`${fmt(row.h,1)} mm`;$("hDefl").textContent=`${fmt(row.w||0,1)} mm`;$("hTank").textContent=`${fmt(row.Vt,2)} m³`;$("hQin").textContent=`${fmt(row.qin,1)} l/s`;$("hQout").textContent=`${fmt(row.site,1)} l/s`;
  if($("hQprimary"))$("hQprimary").textContent=`${fmt(row.qp||0,1)} l/s`;if($("hQemergency"))$("hQemergency").textContent=`${fmt(row.qe||0,1)} l/s`;if($("hQtank"))$("hQtank").textContent=`${fmt(row.qt||0,1)} l/s`;
  if($("hEmergency")){const on=(row.qe||0)>1e-6;$("hEmergency").textContent=on?tr("active"):tr("inactive");$("hEmergency").className=on?"bad":"good";}
}
function showTimelineFrame(i){if(!last?.rows?.length)return;timelineIndex=clamp(Math.round(i),0,last.rows.length-1);const row=last.rows[timelineIndex];updateHud(row);waterVisual(row);if($("timelineRange")){$("timelineRange").max=last.rows.length-1;$("timelineRange").value=timelineIndex;}if($("timelineNow"))$("timelineNow").textContent=`${fmt(row.t/60,1)} min`;if($("timelineEvents"))$("timelineEvents").textContent=`${tr("firstEmergency")}: ${last.emergencyFirst==null?"—":fmt(last.emergencyFirst/60,1)+" min"}${last.tankOverflowFirst==null?"":` · ${tr("tankOverflow")}: ${fmt(last.tankOverflowFirst/60,1)} min`}`;}
function setTimelinePlaying(v){timelinePlaying=!!v;if($("playPause"))$("playPause").textContent=timelinePlaying?`❚❚ ${tr("pause")}`:`▶ ${tr("play")}`;}
function animate(res){
  const token=++animationToken;setTimelinePlaying(true);timelineIndex=0;const start=performance.now(),durationMs=12000;
  function tick(now){if(token!==animationToken||!timelinePlaying)return;const f=clamp((now-start)/durationMs,0,1),i=Math.min(res.rows.length-1,Math.floor(f*(res.rows.length-1)));showTimelineFrame(i);if(f<1)requestAnimationFrame(tick);else setTimelinePlaying(false);}
  requestAnimationFrame(tick);
}

function canvasFit(c){
  const dpr=Math.min(devicePixelRatio||1,2),R=c.getBoundingClientRect(),W=Math.max(10,R.width),H=Math.max(10,R.height);c.width=W*dpr;c.height=H*dpr;
  const x=c.getContext("2d");x.setTransform(dpr,0,0,dpr,0,0);return{x,W,H};
}
function drawHydro(res){
  const{x,W,H}=canvasFit($("hydroChart"));x.fillStyle="#111b24";x.fillRect(0,0,W,H);
  const p={l:48,r:48,t:17,b:24},T=Math.max(1,res.rows.at(-1)?.t||1),split=Math.round(H*.61),topH=split-p.t-10,botTop=split+12,botH=H-p.b-botTop;
  const maxH=Math.max(10,res.maxH*1.15,res.maxDefl*1.15,res.roof.parapetMm*.25),maxV=Math.max(1,res.tank?.capacityM3||0,res.maxVt)*1.1,maxQ=Math.max(1,...res.rows.map(r=>Math.max(r.qin||0,r.qp||0,r.qe||0,r.qt||0)))*1.12;
  const px=t=>p.l+(W-p.l-p.r)*t/T,pyH=h=>p.t+topH*(1-h/maxH),pyV=v=>p.t+topH*(1-v/maxV),pyQ=q=>botTop+botH*(1-q/maxQ);
  x.strokeStyle="#2b3d4a";x.lineWidth=1;for(let i=0;i<=3;i++){let yy=p.t+topH*i/3;x.beginPath();x.moveTo(p.l,yy);x.lineTo(W-p.r,yy);x.stroke();}for(let i=0;i<=2;i++){let yy=botTop+botH*i/2;x.beginPath();x.moveTo(p.l,yy);x.lineTo(W-p.r,yy);x.stroke();}
  const line=(key,py,color,width=1.8,dash=[])=>{x.save();x.strokeStyle=color;x.lineWidth=width;x.setLineDash(dash);x.beginPath();res.rows.forEach((r,i)=>i?x.lineTo(px(r.t),py(r[key]||0)):x.moveTo(px(r.t),py(r[key]||0)));x.stroke();x.restore();};
  line("h",pyH,"#55b8ff",2.1);line("Vt",pyV,"#60d7a3",2);if(res.structure?.model!=="rigid")line("w",pyH,"#f2bd61",1.5);
  line("qin",pyQ,"#9fc7e4",1.3,[5,4]);line("qp",pyQ,"#2f95d0",1.9);line("qe",pyQ,"#ff6d6d",2.1);line("qt",pyQ,"#72dba6",1.9);
  if(res.emergencyFirst!=null){const xx=px(res.emergencyFirst);x.strokeStyle="#ff6d6d";x.setLineDash([3,3]);x.beginPath();x.moveTo(xx,p.t);x.lineTo(xx,H-p.b);x.stroke();x.setLineDash([]);x.fillStyle="#ff9a9a";x.font="10px system-ui";x.fillText(`${tr("firstEmergency")} ${fmt(res.emergencyFirst/60,1)} min`,Math.min(W-165,xx+4),botTop-4);}
  x.fillStyle="#9eb2c1";x.font="10.5px system-ui";x.fillText("mm",8,13);x.fillText("m³",W-28,13);x.fillText("l/s",8,botTop+9);x.fillText("min",W-30,H-6);
  x.fillStyle="#55b8ff";x.fillText(tr("roofDepth"),p.l+4,12);x.fillStyle="#60d7a3";x.fillText(tr("tank"),p.l+110,12);x.fillStyle="#2f95d0";x.fillText(tr("primaryFlow"),p.l+4,botTop+10);x.fillStyle="#ff6d6d";x.fillText(tr("emergencyFlow"),p.l+125,botTop+10);x.fillStyle="#72dba6";x.fillText(tr("tankSewerFlow"),p.l+270,botTop+10);
}

function drawWindRose(s){
  const{x,W,H}=canvasFit($("windRose"));x.fillStyle="#111b24";x.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2+4,rr=Math.min(W,H)*.36,vals=[];let mx=1e-9;
  for(let deg=0;deg<360;deg+=22.5){const q=inflowComponents({...s,windFrom:deg}).wall;vals.push({deg,q});mx=Math.max(mx,q);}
  x.strokeStyle="#314552";x.fillStyle="#9eb2c1";x.font="10px system-ui";x.textAlign="center";
  for(const f of [.33,.66,1]){x.beginPath();x.arc(cx,cy,rr*f,0,Math.PI*2);x.stroke();}
  for(const q of [{d:0,t:"N"},{d:90,t:"E"},{d:180,t:"S"},{d:270,t:"W"}]){const a=rad(q.d-90);x.fillText(q.t,cx+Math.cos(a)*(rr+12),cy+Math.sin(a)*(rr+12)+3);}
  x.fillStyle="rgba(85,184,255,.35)";x.strokeStyle="#55b8ff";x.beginPath();
  vals.forEach((v,i)=>{const a=rad(v.deg-90),r=rr*v.q/mx,px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;i?x.lineTo(px,py):x.moveTo(px,py);});x.closePath();x.fill();x.stroke();
  const a=rad(s.windFrom-90);x.strokeStyle="#f2bd61";x.lineWidth=2.5;x.beginPath();x.moveTo(cx,cy);x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr);x.stroke();x.fillStyle="#f2bd61";x.fillText(`${Math.round(s.windFrom)}°`,cx,17);
}
function renderMass(res){
  const residual=res.volDirect+res.volWall+res.volUpper-res.volDirectPrimary-res.volE-res.volTankOverflow-res.volControlled-res.storedEnd;
  const rows=[[tr("directRain"),res.volDirect],[tr("wallVolume"),res.volWall],[tr("upperIn"),res.volUpper],[tr("directPrimary"),-res.volDirectPrimary],[tr("emergencyOut"),-res.volE],[tr("tankOverflow"),-res.volTankOverflow],[tr("throttleVolume"),-(res.volThrottle||0)],[tr("reuseVolume"),-(res.volReuse||0)],[tr("storedEnd"),-res.storedEnd],[tr("balanceResidual"),residual]];
  $("massTable").innerHTML=rows.map(([a,v])=>`<tr><td>${a}</td><td>${v>=0?"+":""}${fmt(v,2)} m³</td></tr>`).join("");
}
function featureText(k){return FEATURE_TEXT[k]?.[li()]||FEATURE_TEXT[k]?.[0]||k}
function packStatusText(p){return PACK_STATUS_TEXT[p.tier]?.[li()]||PACK_STATUS_TEXT[p.tier]?.[0]||p.tier}
function packBasisText(p){return BASIS_TEXT[p.basis]?.[li()]||BASIS_TEXT[p.basis]?.[0]||BASIS_TEXT.generic[li()]||BASIS_TEXT.generic[0]}
function pushCheck(c,k,a,b){c.push({k,a,b})}
function minSpainDrains(A){if(A<100)return 2;if(A<200)return 3;if(A<500)return 4;return Math.ceil(A/150)}
function drainGeometryStats(res){
  const r=res.roof,cx=r.pos?.[0]||0,cy=r.pos?.[1]||0,hx=r.size[0]/2,hy=r.size[1]/2,ds=res.s.scene.objects.filter(o=>o.type==="drain");
  let maxEdge=0,maxNearest=0;
  for(const d of ds){const edge=Math.min(hx-Math.abs(d.pos[0]-cx),hy-Math.abs(d.pos[1]-cy));maxEdge=Math.max(maxEdge,Math.max(0,edge));}
  if(ds.length>1)for(let i=0;i<ds.length;i++){let near=Infinity;for(let j=0;j<ds.length;j++)if(i!==j)near=Math.min(near,Math.hypot(ds[i].pos[0]-ds[j].pos[0],ds[i].pos[1]-ds[j].pos[1]));maxNearest=Math.max(maxNearest,near);}
  return{count:ds.length,maxEdge,maxNearest,drains:ds};
}
function codeSpecificChecks(res){
  const c=[],s=res.s,p=PACKS[s.jurisdiction],A=res.A,t=res.tank,g=drainGeometryStats(res),overs=s.scene.objects.filter(o=>o.type==="overflow");
  if(s.jurisdiction==="NL"){
    pushCheck(c,s.scenario==="blocked"?"good":"warn",tr("scenarioBasis"),s.scenario==="blocked"?`${tr("blocked")} · ${tr("pass")}`:`${tr("blocked")} · ${tr("notChecked")}`);
  }else if(s.jurisdiction==="US"){
    const q=s.rain*A/10000;pushCheck(c,"info",tr("rainReference"),`100-y · 1 h · Q = ${fmt(q,1)} l/s`);
    pushCheck(c,"info",tr("emergencyCapacity"),`Qsecondary,target = Qprimary,design = ${fmt(q,1)} l/s`);
    pushCheck(c,s.scenario==="blocked"?"good":"warn",tr("scenarioBasis"),s.scenario==="blocked"?`${tr("blocked")} · ${tr("pass")}`:`${tr("blocked")} · ${tr("notChecked")}`);
  }else if(s.jurisdiction==="CA"){
    const minD=Math.max(1,Math.ceil(A/900));
    pushCheck(c,res.maxH<=150?"good":"bad",tr("controlledDepth"),`${fmt(res.maxH,1)} / 150 mm`);
    pushCheck(c,res.drainDown!=null&&res.drainDown<=24*3600?"good":"bad",tr("drainDown"),res.drainDown==null?`> ${fmt((res.tEnd-s.duration*60)/3600,1)} h`:`${fmt(res.drainDown/3600,2)} / 24 h`);
    pushCheck(c,"info",tr("minDrainCount"),`${tr("notChecked")} · ${tr("normalDrainScope")}`);
    if(Math.abs(s.duration-15)<.01){
      const qReq=2*s.rain*A/10000,qAvail=overs.reduce((q,o)=>q+overflowFlowLps(o,150),0);
      pushCheck(c,qAvail>=qReq?"good":"bad",tr("emergencyCapacity"),`${fmt(qAvail,1)} / ${fmt(qReq,1)} l/s · 200%`);
    }else pushCheck(c,"info",tr("emergencyCapacity"),`200% · 15 min · ${tr("notChecked")}`);
  }else if(s.jurisdiction==="ES"){
    const minD=minSpainDrains(A),slope=Math.hypot(res.roof.slopeXmmM||0,res.roof.slopeYmmM||0),imh=s.rain*.36,f=imh/100;
    pushCheck(c,"info",tr("minDrainCount"),`${tr("notChecked")} · ${tr("normalDrainScope")}`);
    pushCheck(c,slope<=5+1e-9?"good":"warn",tr("roofSlope"),`${fmt(slope,1)} / 5.0 mm/m`);
    pushCheck(c,"info",tr("rainReference"),`${fmt(imh,1)} mm/h · f = ${fmt(f,3)} · ref 100 mm/h`);
  }else if(s.jurisdiction==="AR"){
    const walls=s.scene.objects.filter(o=>o.type==="wall"&&o.toRoof),Aw=walls.reduce((a,o)=>a+(o.widthM||o.size[0])*(o.heightM||o.size[2]),0),qFloor=s.rain*.5*Aw/10000;
    pushCheck(c,"info",tr("wallRule"),`Aeff,min = 0.50 × Awall = ${fmt(.5*Aw,1)} m² · Qmin = ${fmt(qFloor,1)} l/s`);
    if(t){
      const lim=(30*2.7777777778)*A/10000;
      pushCheck(c,(t.releaseDelayMin||0)>=10?"good":"bad",tr("pumpDelay"),`${fmt(t.releaseDelayMin||0,0)} / 10 min`);
      pushCheck(c,(t.throttleLps||0)<=lim+1e-9?"good":"bad",tr("pumpLimit"),`${fmt(t.throttleLps||0,2)} / ${fmt(lim,2)} l/s · 30 mm/h`);
    }else pushCheck(c,"bad",tr("minTank"),tr("notChecked"));
    pushCheck(c,"info",tr("rainReference"),`T ≥ 50 y · ${tr("projectRain")}`);
  }else if(s.jurisdiction==="BE-FL"){
    const infTarget=.033*A;pushCheck(c,"info",tr("minTank"),`${tr("flandersInfRef")} = ${fmt(infTarget,1)} m³ · 33 l/m²`);
    if(A>=1000){
      const target=.043*A,lim=5*A/10000;
      pushCheck(c,t&&(t.capacityM3||0)>=target-1e-9?"good":"bad",tr("minTank"),`${fmt(t?.capacityM3||0,1)} / ${fmt(target,1)} m³ · 43 l/m² · ${tr("conditional")}`);
      pushCheck(c,t&&(t.throttleLps||0)<=lim+1e-9?"good":"bad",tr("maxThrottle"),`${fmt(t?.throttleLps||0,2)} / ${fmt(lim,2)} l/s · 5 l/s/ha · ${tr("conditional")}`);
    }else pushCheck(c,"info",tr("scenarioBasis"),tr("flandersAreaNote"));
  }else if(s.jurisdiction==="BE-BRU"){
    const target=.033*A;
    pushCheck(c,t&&(t.capacityM3||0)>=target-1e-9?"good":"bad",tr("minTank"),`${fmt(t?.capacityM3||0,1)} / ${fmt(target,1)} m³ · 33 l/m²`);
    pushCheck(c,"info",tr("scenarioBasis"),tr("brusselsEnhanced"));
  }else if(s.jurisdiction==="UK"){
    const req=.005*A,allToTank=g.drains.every(d=>d.toTank),storage=(t?.capacityM3||0)+(res.roof.deadMm||0)/1000*A;
    pushCheck(c,storage>=req&&allToTank?"good":"warn",tr("interception5"),`${fmt(storage,1)} / ${fmt(req,1)} m³ · 5 mm`);
    pushCheck(c,"info",tr("rainReference"),`1% AEP · ${tr("criticalDuration")}`);
  }else if(s.jurisdiction==="UA"){
    const qExt=primaryBoundaryTotal(s);
    pushCheck(c,"info",tr("capacityFactor"),`${tr("normalDrainScope")} ΣQexternal = ${fmt(qExt,1)} l/s`);
    const zmin=Math.min(...Array.from(res.grid.z0)),tol=.01;let nearLow=0;for(const d of g.drains){const k=res.grid.cellAt(d.pos[0],d.pos[1]);if(res.grid.z0[k]<=zmin+tol)nearLow++;}
    pushCheck(c,"info",tr("scenarioBasis"),`${nearLow}/${g.count} · ${tr("uaLowPoint")}`);
  }else if(s.jurisdiction==="DE"){
    pushCheck(c,"info",tr("rainReference"),`KOSTRA-DWD-2020 · D=${fmt(s.duration,0)} min · ${tr("projectRain")}`);
    pushCheck(c,"info",tr("scenarioBasis"),tr("criticalDuration"));
  }else if(["AT","CH","FR","BE-WA"].includes(s.jurisdiction)){
    pushCheck(c,"info",tr("rainReference"),tr("projectRain"));
  }
  return c;
}
function generalChecksFor(res){
  const c=[],r=res.roof,t=res.tank,overs=res.s.scene.objects.filter(o=>o.type==="overflow"),drains=res.s.scene.objects.filter(o=>o.type==="drain"),sz=emergencySizing(res);
  pushCheck(c,res.maxEdgeExcess<=0?"good":"bad",tr("parapet"),`Δ = ${fmt(res.maxEdgeExcess,1)} mm`);
  for(const o of overs){
    const shape=o.openingShape||"circular",h=shape==="rectangular"?(o.heightMm||120):(o.diameterMm||120),top=(o.thresholdMm||0)+h,geom=shape==="rectangular"?`${Math.max(1,Math.round(o.count||1))}×${fmt(o.widthMm||300,0)}×${fmt(o.heightMm||120,0)}`:`${Math.max(1,Math.round(o.count||1))}×Ø${fmt(o.diameterMm||120,0)}`;
    pushCheck(c,top<=(r.parapetMm||0)+1e-9?"good":"bad",tr("overflowGeometry"),`${geom} · ${fmt(o.thresholdMm||0,0)}…${fmt(top,0)} mm / parapet ${fmt(r.parapetMm||0,0)} mm`);
  }
  pushCheck(c,sz.qAvail+1e-9>=sz.qReq?"good":"bad",tr("requiredEmergency"),`${fmt(sz.qAvail,2)} / ${fmt(sz.qReq,2)} l/s @ parapet crest`);
  const routed=drains.filter(d=>d.toTank).length;
  pushCheck(c,"info",tr("primaryFlow"),`${tr("externalBoundary")} · ΣQ = ${fmt(primaryBoundaryTotal(res.s),2)} l/s · ${tr("normalDrainScope")}`);
  if(routed&&!t)pushCheck(c,"bad",tr("engineeringReality"),`${routed} ${tr("drain")} → ${tr("tank")} · ${tr("notChecked")}`);else if(routed)pushCheck(c,"info",tr("engineeringReality"),`${routed}/${drains.length} ${tr("primaryToTank")} · ${tr("tankSewerFlow")} ${fmt(t.throttleLps||0,2)} l/s`);
  if(res.structure?.model!=="rigid"&&Number(r.structAlertMm)>0)pushCheck(c,res.maxDefl<r.structAlertMm?"good":"bad",tr("structCheck"),`${fmt(res.maxDefl,1)} / ${fmt(r.structAlertMm,0)} mm`);
  if(t)pushCheck(c,res.tankOverflowFirst==null?"good":"bad",tr("tankOverflow"),res.tankOverflowFirst==null?tr("pass"):`t = ${fmt(res.tankOverflowFirst/60,1)} min`);
  pushCheck(c,res.peakE>1e-6?"warn":"good",tr("emergencyOut"),res.peakE>1e-6?`${fmt(res.peakE,1)} l/s · t₁ ${fmt((res.emergencyFirst||0)/60,1)} min`:"0 l/s");
  return c;
}
function complianceFor(res){
  const p=PACKS[res.s.jurisdiction],checks=[...generalChecksFor(res),...codeSpecificChecks(res)];
  if(checks.some(q=>q.k==="bad"))return{status:"fail",label:tr("failStar"),checks};
  if(p.tier==="framework")return{status:"partial",label:tr("partial"),checks};
  return{status:"pass",label:tr("passStar"),checks};
}
function scenarioForPack(code,current){const p=PACKS[code];if(p.sc.includes(current))return current;if(current==="blocked"&&p.sc.includes("extreme"))return"extreme";if(current==="retention"&&p.sc.includes("retention"))return"retention";return p.sc[0];}
function comparisonLabel(status){return status==="pass"?tr("passStar"):status==="fail"?tr("failStar"):status==="partial"?tr("partial"):tr("inputNeeded");}
function comparisonEventFor(code,mode,base){
  if(mode==="same")return{rain:base.rain,duration:base.duration,source:"same"};
  const rp=rainProfile(code);if(!rp.validRain)return null;return{rain:rp.rain*Math.max(.01,base.rainFactor||1),duration:rp.duration*Math.max(.01,base.durationFactor||1),source:rp.source};
}
async function runCodeComparison(){
  const btn=$("compareRun"),status=$("compareStatus"),mode=$("compareMode")?.value||"same",base=state();comparisonModeLast=mode;comparisonResults=[];
  if(btn)btn.disabled=true;if(status)status.textContent=`0 / ${Object.keys(PACKS).length}`;
  let done=0;const physicalCache=new Map();
  for(const code of Object.keys(PACKS)){
    const ev=comparisonEventFor(code,mode,base);
    if(!ev){comparisonResults.push({code,status:"input",event:null});done++;if(status)status.textContent=`${done} / ${Object.keys(PACKS).length}`;continue;}
    const ss=JSON.parse(JSON.stringify(base));ss.jurisdiction=code;ss.scenario=scenarioForPack(code,base.scenario);ss.rain=ev.rain;ss.duration=ev.duration;
    const physKey=[fmt(ev.rain,8),fmt(ev.duration,8),ss.scenario,code==="AR"?"AR":"GEN"].join("|");let raw=physicalCache.get(physKey);if(!raw){raw=simulate(ss);physicalCache.set(physKey,raw);}const res=raw.s.jurisdiction===code?raw:{...raw,s:ss};
    const comp=complianceFor(res);comparisonResults.push({code,status:comp.status,event:ev,res,scenario:ss.scenario,comp});
    done++;if(status)status.textContent=`${done} / ${Object.keys(PACKS).length}`;await new Promise(r=>setTimeout(r,0));
  }
  renderComparison();if(btn)btn.disabled=false;if(status)status.textContent=`${comparisonResults.length} · ${mode==="same"?tr("sameStorm"):tr("codeStorm")}`;
}
function renderComparison(){
  const tb=$("compareTable");if(!tb)return;
  const rows=comparisonResults.map(x=>{
    const event=x.event?`${fmt(x.event.rain*.36,1)} mm/h · ${fmt(x.event.duration,0)} min`:"—";
    const cls=x.status==="pass"?"good":x.status==="fail"?"bad":x.status==="partial"?"warn":"info";
    const rr=x.res,label=comparisonLabel(x.status);return`<tr data-jur="${x.code}"><td><span class="comparebadge ${cls}">${label}</span></td><td><b>${x.code}</b><br><small>${jurText(x.code)}</small></td><td>${event}</td><td>${rr?fmt(rr.maxH,1)+" mm":"—"}</td><td>${rr?fmt(rr.maxVt,1)+" m³":"—"}</td><td>${rr?fmt(rr.peakSite,1)+" l/s":"—"}</td></tr>`;
  }).join("");
  tb.innerHTML=`<thead><tr><th>${tr("comparisonResult")}</th><th>${tr("comparisonCode")}</th><th>${tr("comparisonEvent")}</th><th>${tr("comparisonDepth")}</th><th>${tr("comparisonTank")}</th><th>${tr("comparisonPeak")}</th></tr></thead><tbody>${rows||`<tr><td colspan="6" class="muted">${tr("runComparison")}</td></tr>`}</tbody>`;
  tb.querySelectorAll("tbody tr[data-jur]").forEach(r=>r.onclick=()=>{const code=r.dataset.jur,x=comparisonResults.find(q=>q.code===code);saveRainControls();$("jurisdiction").value=code;rebuildScenarios(x?.scenario);loadRainControls(code,true);if(x?.event){$("rain").value=x.event.rain;$("duration").value=x.event.duration;syncFactorsFromApplied();}run(false);});
  if($("compareFoot"))$("compareFoot").textContent=tr("compareFoot");
}
function renderChecks(res){
  const general=generalChecksFor(res);
  const renderGroup=(title,arr)=>`<div class="checkgroup"><div class="checkgroup-title">${title}</div>${arr.map(q=>`<div class="check"><span class="dot ${q.k}"></span><div><b>${q.a}</b><div class="muted">${q.b}</div></div><span class="${q.k}">${q.k==="good"?tr("pass"):q.k==="bad"?tr("fail"):tr("info")}</span></div>`).join("")}</div>`;
  $("checks").innerHTML=renderGroup(tr("generalChecks"),general)+renderGroup(tr("codeChecks"),codeSpecificChecks(res));
}
function renderProfile(s){
  const p=PACKS[s.jurisdiction],status=packStatusText(p),features=(p.features||[]).map(featureText).join(" · "),basis=packBasisText(p);
  $("profileChip").textContent=`${s.jurisdiction} · ${status}`;
  $("profileInfo").innerHTML=`<b>${jurText(s.jurisdiction)} · ${packStandard(p)}</b><div class="profile-status ${p.tier}">${status}</div><p class="muted">${features}</p><div class="profile-kv"><b>${tr("rainBasis")}</b><span>${basis}</span><b>${tr("sourceBasis")}</b><span>${p.sources.join("<br>")}</span><b>${tr("scopeLimits")}</b><span>${p.tier==="framework"?tr("projectRain"):tr("sourceNote")}</span></div><div class="note">UI: <b>${lang}</b> · jurisdiction: <b>${s.jurisdiction}</b></div>`;
  if($("stormBasis")){const mmh=s.rain*.36,total=mmh*s.duration/60,rr=s.referenceRain??s.rain,rd=s.referenceDuration??s.duration;$("stormBasis").innerHTML=`<b>${tr("rainBasis")}:</b> ${basis}<br><b>${tr("referenceEvent")}:</b> ${fmt(rr,1)} l/s·ha · ${fmt(rd,0)} min · ${rainReferenceLabel(s.jurisdiction)}<br><b>${tr("appliedEvent")}:</b> ${fmt(s.rain,1)} l/s·ha = ${fmt(mmh,1)} mm/h · ${fmt(s.duration,0)} min → ${fmt(total,1)} mm · ×${fmt(s.rainFactor??1,2)} / ×${fmt(s.durationFactor??1,2)}`;}
  updateRainReferenceHint();
}
function renderResults(res){
  $("mDepth").textContent=`${fmt(res.maxH,1)} mm`;$("mRoofV").textContent=`${fmt(res.maxVr,1)} m³`;$("mTankV").textContent=`${fmt(res.maxVt,1)} m³`;$("mSite").textContent=`${fmt(res.peakSite,1)} l/s`;$("mDrainDown").textContent=res.drainDown==null?"—":`${fmt(res.drainDown/3600,2)} h`;$("mWall").textContent=`${fmt(res.volWall,1)} m³`;$("mTankReq").textContent=lastTankReq==null?"—":`${fmt(lastTankReq,1)} m³`;$("mFlood").textContent=`${fmt(res.maxFloodArea,0)} m²`;$("mGrid").textContent=`${res.grid.nx} × ${res.grid.ny}`;
  $("mDefl").textContent=`${fmt(res.maxDefl||0,1)} mm`;$("mRigidDepth").textContent=res.rigidMaxH==null?"—":`${fmt(res.rigidMaxH,1)} mm`;$("mPondAmp").textContent=res.pondingAmplification==null?"—":`${fmt(res.pondingAmplification,2)}×`;if($("mEmergencyFirst"))$("mEmergencyFirst").textContent=res.emergencyFirst==null?"—":`${fmt(res.emergencyFirst/60,1)} min`;const es=emergencySizing(res);if($("mOverflowGeom"))$("mOverflowGeom").textContent=`${es.actualHoles} · ${fmt(es.qAvail,1)} / ${fmt(es.qReq,1)} l/s`;if($("mTankThrottle"))$("mTankThrottle").textContent=res.tank?`${fmt(res.tank.throttleLps||0,2)} l/s`:"—";
  renderMass(res);renderChecks(res);renderProfile(res.s);drawHydro(res);drawWindRose(res.s);
}
function run(doAnimate=true){
  animationToken++;const s=state(),res=simulate(s);
  if(res.structure?.model!=="rigid"){const rigid=simulate(s,{forceRigid:true});res.rigidMaxH=rigid.maxH;res.pondingAmplification=rigid.maxH>1e-9?res.maxH/rigid.maxH:null;}else{res.rigidMaxH=res.maxH;res.pondingAmplification=1;}
  last=res;renderResults(res);if(editor?.getSelected()?.type==="overflow")renderInspector(editor.getSelected());
  if($("timelineRange")){$("timelineRange").max=Math.max(0,res.rows.length-1);}if(doAnimate)animate(res);else{let ix=0;for(let i=1;i<res.rows.length;i++)if(res.rows[i].h>res.rows[ix].h)ix=i;showTimelineFrame(ix);setTimelinePlaying(false);}
  return res;
}
function sizeTankNow(){
  lastTankReq=requiredTank(state());run(false);const t=activeTank();
  if(t&&confirm(`${tr("requiredTank")}: ${fmt(lastTankReq,1)} m³\n\n${tr("applyTank")}`)){t.capacityM3=Math.ceil(lastTankReq*10)/10;renderInspector(t);run(false);}
}

function makePlaced(kind,q,ghost){
  const base={id:ghost?-999:nextId(),type:kind,name:"",pos:[q[0],q[1],.24],rotZ:0};
  if(kind==="wall")return{...base,shape:"box",name:tr("wall"),size:[6,.22,4],color:COLORS.wall,widthM:6,heightM:4,azimuthDeg:180,runoffC:.9,toRoof:true};
  if(kind==="drain")return{...base,shape:"drain",name:tr("drain"),size:[.6,.6,.1],radius:.32,color:COLORS.drain,externalFlowLps:5,blockagePct:0,toTank:true};
  if(kind==="overflow"){const o={...base,shape:"overflow",name:tr("overflow"),size:[2,.2,.2],color:COLORS.overflow,count:2,openingShape:"circular",diameterMm:120,widthMm:300,heightMm:120,cd:.62,thresholdMm:90};snapOverflowToParapet(o);return o;}
  if(kind==="tank"){const o={...base,shape:"box",name:tr("tank"),size:[3,3,2.3],color:COLORS.tank,alpha:.78,capacityM3:20,initialM3:0,throttleLps:1,reuseLps:0,releaseDelayMin:0};normalizeTank(o);return o;}
  if(kind==="catchment")return{...base,shape:"box",name:tr("upperRoof"),pos:[q[0],q[1],3.2],size:[6,5,.25],color:COLORS.catchment,areaM2:30,runoffC:1,toRoof:true};
  if(kind==="lowspot")return{...base,shape:"box",name:tr("lowSpot"),pos:[q[0],q[1],.235],size:[6,6,.035],color:COLORS.lowspot,alpha:.38,depthMm:20,radiusM:3};
}
function placement(kind){editor.startPlacement((q,ghost)=>{const o=makePlaced(kind,q,ghost);normalizeWall(o);if(o.type==="tank")normalizeTank(o);if(o.type==="overflow")snapOverflowToParapet(o);return o;});}
function typeLabel(o){return tr({wall:"wall",drain:"drain",overflow:"overflow",tank:"tank",catchment:"upperRoof",lowspot:"lowSpot",roof:"roof"}[o.type]||o.type);}
function renderObjectList(){
  const list=$("objectList");list.innerHTML="";
  for(const o of scene.objects.filter(q=>!q._dynamic&&q.type!=="roof")){
    const d=document.createElement("div");d.className="objrow"+(editor?.selected===o.id?" sel":"");
    let meta=`#${o.id}`;if(o.type==="drain")meta=`Qext ${fmt(o.externalFlowLps??0,1)} l/s · ${o.toTank?tr("primaryToTank"):tr("primaryDirect")}`;else if(o.type==="overflow")meta=(o.openingShape||"circular")==="rectangular"?`${Math.max(1,Math.round(o.count||1))}×${fmt(o.widthMm||300,0)}×${fmt(o.heightMm||120,0)} @ ${fmt(o.thresholdMm||0,0)} mm`:`${Math.max(1,Math.round(o.count||1))}×Ø${fmt(o.diameterMm||120,0)} @ ${fmt(o.thresholdMm||0,0)} mm`;else if(o.type==="tank")meta=`${fmt(o.capacityM3||0,1)} m³ · ${fmt(o.throttleLps||0,2)} l/s`;
    d.innerHTML=`<span>${typeLabel(o)}</span><b>${o.name||"#"+o.id}</b><small>${meta}</small>`;d.onclick=()=>editor.select(o.id);list.appendChild(d);
  }
}
function field(key,value,type="number",step="1",handler=null){
  const r=document.createElement("div");r.className="row";const l=document.createElement("label");l.textContent=tr(key);const i=document.createElement("input");i.type=type;i.step=step;i.value=value??"";if(handler)i.onchange=()=>handler(i);r.append(l,i);return r;
}
function selectField(key,value,options,handler){
  const r=document.createElement("div");r.className="row";const l=document.createElement("label"),i=document.createElement("select");l.textContent=tr(key);
  for(const [v,labelKey] of options){const op=document.createElement("option");op.value=v;op.textContent=tr(labelKey);i.appendChild(op);}i.value=value;if(handler)i.onchange=()=>handler(i);r.append(l,i);return r;
}
function boolField(key,value,handler){
  const r=document.createElement("div");r.className="row",l=document.createElement("label"),i=document.createElement("input");l.textContent=tr(key);i.type="checkbox";i.checked=!!value;i.onchange=()=>handler(i);r.append(l,i);return r;
}
function cloneObject(o){
  const q=JSON.parse(JSON.stringify(o));q.id=nextId();q.name=(o.name||typeLabel(o))+" "+tr("copyWord");q.pos[0]+=.8;q.pos[1]+=.8;scene.objects.push(q);editor.select(q.id);editor.render();run(false);
}
function renderInspector(o){
  const box=$("inspector");box.innerHTML="";
  if(!o||o._dynamic){box.innerHTML=`<div class="inspector-empty">${tr("selectObject")}</div>`;renderObjectList();return;}
  const title=document.createElement("div");title.className="subhead";title.textContent=`${typeLabel(o)} · #${o.id}`;box.appendChild(title);
  box.appendChild(field("name",o.name,"text","",i=>{o.name=i.value;renderObjectList();editor.render()}));
  if(o.type!=="roof"){box.appendChild(field("x",fmt(o.pos[0],2),"number",".1",i=>{o.pos[0]=Number(i.value);editor.render()}));box.appendChild(field("y",fmt(o.pos[1],2),"number",".1",i=>{o.pos[1]=Number(i.value);editor.render()}));}
  if(o.type==="wall"){
    box.appendChild(field("width",o.widthM,"number",".1",i=>{o.widthM=Math.max(.1,Number(i.value));normalizeWall(o);editor.render();run(false)}));
    box.appendChild(field("height",o.heightM,"number",".1",i=>{o.heightM=Math.max(.1,Number(i.value));normalizeWall(o);editor.render();run(false)}));
    box.appendChild(field("azimuth",o.azimuthDeg,"number","5",i=>{o.azimuthDeg=wrap(Number(i.value));normalizeWall(o);editor.render();run(false)}));
    box.appendChild(field("wallC",o.runoffC,"number",".05",i=>{o.runoffC=clamp(Number(i.value),0,1.5);run(false)}));
    box.appendChild(boolField("toRoof",o.toRoof,i=>{o.toRoof=i.checked;run(false)}));
  }else if(o.type==="drain"){
    if(o.externalFlowLps==null)o.externalFlowLps=Math.max(0,o.capacityLps||0);
    box.appendChild(field("capacity",o.externalFlowLps,"number",".1",i=>{o.externalFlowLps=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("blockage",o.blockagePct,"number","5",i=>{o.blockagePct=clamp(Number(i.value),0,100);run(false)}));
    box.appendChild(boolField("toTank",o.toTank,i=>{o.toTank=i.checked;run(false)}));
    {const info=document.createElement("div");info.className="codehint";info.textContent=tr("normalDrainScope");box.appendChild(info);}
  }else if(o.type==="overflow"){
    o.openingShape=o.openingShape||"circular";
    box.appendChild(selectField("overflowShape",o.openingShape,[["circular","circular"],["rectangular","rectangular"]],i=>{o.openingShape=i.value;renderInspector(o);editor.render();run(false)}));
    box.appendChild(field("overflowCount",o.count||1,"number","1",i=>{o.count=Math.max(1,Math.round(Number(i.value)));editor.render();run(false)}));
    if(o.openingShape==="rectangular"){
      box.appendChild(field("overflowWidth",o.widthMm||300,"number","10",i=>{o.widthMm=Math.max(20,Number(i.value));editor.render();run(false)}));
      box.appendChild(field("overflowHeight",o.heightMm||120,"number","10",i=>{o.heightMm=Math.max(20,Number(i.value));editor.render();run(false)}));
    }else{
      box.appendChild(field("overflowDiameter",o.diameterMm||120,"number","5",i=>{o.diameterMm=Math.max(20,Number(i.value));editor.render();run(false)}));
    }
    box.appendChild(field("overflowSill",o.thresholdMm||0,"number","5",i=>{o.thresholdMm=Math.max(0,Number(i.value));editor.render();run(false)}));
    box.appendChild(field("overflowCd",o.cd??.62,"number",".01",i=>{o.cd=clamp(Number(i.value),.2,1);run(false)}));
    if(last){const sz=emergencySizing(last,o),info=document.createElement("div");info.className="codehint";
      const reqSize=o.openingShape==="rectangular"?`<b>${tr("requiredWidth")}:</b> ${fmt(sz.detail.wReq,0)} mm`:`<b>${tr("requiredDiameter")}:</b> Ø${fmt(sz.detail.dReq,0)} mm`;
      const unitGeom=o.openingShape==="rectangular"?`${fmt(o.widthMm||300,0)}×${fmt(o.heightMm||120,0)} mm`:`Ø${fmt(o.diameterMm||120,0)} mm`;
      info.innerHTML=`<b>${tr("capacityAtParapet")}:</b> ${fmt(overflowFlowLps(o,last.roof.parapetMm),2)} l/s<br><b>${tr("requiredEmergency")}:</b> ${fmt(sz.qReq,2)} l/s<br><b>${tr("requiredOpenings")}:</b> ${sz.detail.nReq} × ${unitGeom}<br>${reqSize}`;box.appendChild(info);}
  }else if(o.type==="tank"){
    box.appendChild(field("tankCapacity",o.capacityM3,"number",".5",i=>{o.capacityM3=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("initial",o.initialM3,"number",".5",i=>{o.initialM3=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("throttle",o.throttleLps,"number",".1",i=>{o.throttleLps=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("reuse",o.reuseLps,"number",".1",i=>{o.reuseLps=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("releaseDelay",o.releaseDelayMin||0,"number","1",i=>{o.releaseDelayMin=Math.max(0,Number(i.value));run(false)}));
    {const info=document.createElement("div");info.className="codehint";info.innerHTML=`<b>${tr("tankThrottleOnly")}:</b> ${fmt(o.throttleLps||0,2)} l/s<br><b>${tr("engineeringReality")}:</b> ${tr("primaryToTank")} → ${tr("tank")} → ${tr("sewer")}`;box.appendChild(info);}
  }else if(o.type==="catchment"){
    box.appendChild(field("catchArea",o.areaM2,"number","1",i=>{o.areaM2=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("catchC",o.runoffC,"number",".05",i=>{o.runoffC=clamp(Number(i.value),0,1.5);run(false)}));
    box.appendChild(boolField("toRoof",o.toRoof,i=>{o.toRoof=i.checked;run(false)}));
  }else if(o.type==="lowspot"){
    box.appendChild(field("lowDepth",o.depthMm,"number","1",i=>{o.depthMm=Math.max(0,Number(i.value));run(false)}));
    box.appendChild(field("lowRadius",o.radiusM,"number",".25",i=>{o.radiusM=Math.max(.15,Number(i.value));o.size[0]=o.size[1]=Math.max(.3,o.radiusM*2);editor.render();run(false)}));
  }
  if(o.type!=="roof"){
    const a=document.createElement("div");a.className="inspector-actions";const b1=document.createElement("button"),b2=document.createElement("button");b1.textContent=tr("clone");b2.textContent=tr("delete");b1.onclick=()=>cloneObject(o);b2.onclick=()=>editor.deleteSelected();a.append(b1,b2);box.appendChild(a);
  }
  renderObjectList();
}
function showContext(e,o){
  const m=$("context");m.innerHTML="";if(!o||o.type==="roof"){m.style.display="none";return;}
  const mk=(txt,fn)=>{const b=document.createElement("button");b.textContent=txt;b.onclick=()=>{m.style.display="none";fn()};m.appendChild(b);};
  mk(tr("clone"),()=>cloneObject(o));mk(tr("rotate90"),()=>{if(o.type==="wall"){o.azimuthDeg=wrap((o.azimuthDeg||0)+90);normalizeWall(o)}else o.rotZ=(o.rotZ||0)+Math.PI/2;editor.render();run(false)});mk(tr("delete"),()=>editor.deleteSelected());
  m.style.display="block";m.style.left=Math.min(innerWidth-190,e.clientX)+"px";m.style.top=Math.min(innerHeight-140,e.clientY)+"px";
}
function drawSpatialOverlay(ctx,ed){
  const f=currentSpatialFrame;if(!f?.grid||!f.depths)return;const g=f.grid,r=roof(),top=(r.pos?.[2]||0)+(r.size?.[2]||.22),depths=f.depths,defl=f.deflections||new Float32Array(g.N);let mx=0,imax=0,mw=0,iw=0;for(let k=0;k<depths.length;k++){if(depths[k]>mx){mx=depths[k];imax=k;}if((defl[k]||0)>mw){mw=defl[k];iw=k;}}
  const roofCells=[],cells=[];for(let j=0;j<g.ny;j++)for(let i=0;i<g.nx;i++){const k=j*g.nx+i,h=depths[k],w=defl[k]||0,x0=g.x0+i*g.dx,x1=x0+g.dx,y0=g.y0+j*g.dy,y1=y0+g.dy,zRoof=top+g.z0[k]-w,zWater=zRoof+h/1000;
    if(w>.00002){const ps=[[x0,y0,zRoof],[x1,y0,zRoof],[x1,y1,zRoof],[x0,y1,zRoof]].map(q=>ed.project(q));if(!ps.some(q=>!q))roofCells.push({w,ps,depth:ps.reduce((a,q)=>a+q.z,0)/4});}
    if(h>=.05){const ps=[[x0,y0,zWater],[x1,y0,zWater],[x1,y1,zWater],[x0,y1,zWater]].map(q=>ed.project(q));if(!ps.some(q=>!q))cells.push({h,ps,depth:ps.reduce((a,q)=>a+q.z,0)/4});}
  }
  ctx.save();roofCells.sort((a,b)=>b.depth-a.depth);for(const c of roofCells){const fz=Math.sqrt(clamp(c.w/Math.max(.000001,mw),0,1));ctx.beginPath();ctx.moveTo(c.ps[0].x,c.ps[0].y);for(let n=1;n<4;n++)ctx.lineTo(c.ps[n].x,c.ps[n].y);ctx.closePath();ctx.fillStyle=`rgba(242,189,97,${.035+.11*fz})`;ctx.fill();ctx.strokeStyle=`rgba(190,132,40,${.08+.14*fz})`;ctx.lineWidth=.45;ctx.stroke();}
  cells.sort((a,b)=>b.depth-a.depth);for(const c of cells){const fz=Math.sqrt(clamp(c.h/Math.max(1,mx),0,1)),over=c.h>(r.parapetMm||1);ctx.beginPath();ctx.moveTo(c.ps[0].x,c.ps[0].y);for(let n=1;n<4;n++)ctx.lineTo(c.ps[n].x,c.ps[n].y);ctx.closePath();ctx.fillStyle=over?`rgba(255,94,94,${.22+.42*fz})`:`rgba(39,151,222,${.10+.48*fz})`;ctx.fill();if(c.h>10){ctx.strokeStyle=`rgba(30,112,168,${.12+.18*fz})`;ctx.lineWidth=.55;ctx.stroke();}}
  if(mx>=.05){const i=imax%g.nx,j=Math.floor(imax/g.nx),x=g.x0+(i+.5)*g.dx,y=g.y0+(j+.5)*g.dy,z=top+g.z0[imax]-(defl[imax]||0)+mx/1000,p=ed.project([x,y,z+.05]);if(p){ctx.fillStyle="#e8f5ff";ctx.strokeStyle="#176d9f";ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.font="11px ui-monospace,monospace";ctx.textAlign="left";ctx.fillStyle="#12364b";ctx.fillText(`${mx.toFixed(1)} mm`,p.x+7,p.y-5);}}
  if(mw>.00002){const i=iw%g.nx,j=Math.floor(iw/g.nx),x=g.x0+(i+.5)*g.dx,y=g.y0+(j+.5)*g.dy,z=top+g.z0[iw]-mw,p=ed.project([x,y,z-.04]);if(p){ctx.fillStyle="#f2bd61";ctx.font="10px ui-monospace,monospace";ctx.fillText(`w ${ (mw*1000).toFixed(1)} mm`,p.x+6,p.y+12);}}
  ctx.restore();
}
function overflowOutVector(o,r){if(o.edge==="W")return[-1,0];if(o.edge==="E")return[1,0];if(o.edge==="S")return[0,-1];if(o.edge==="N")return[0,1];const cx=r.pos?.[0]||0,cy=r.pos?.[1]||0;return Math.abs(o.pos[0]-cx)>Math.abs(o.pos[1]-cy)?[Math.sign(o.pos[0]-cx),0]:[0,Math.sign(o.pos[1]-cy)];}
function drawPipe(ctx,ed,pts,q,color,label){const ps=pts.map(p=>ed.project(p));if(ps.some(p=>!p))return;ctx.save();ctx.strokeStyle="rgba(55,72,82,.72)";ctx.lineWidth=3;ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);for(let i=1;i<ps.length;i++)ctx.lineTo(ps[i].x,ps[i].y);ctx.stroke();if(q>1e-4){ctx.strokeStyle=color;ctx.lineWidth=2.6+Math.min(4,Math.sqrt(q));ctx.setLineDash([10,7]);ctx.lineDashOffset=-((currentVisualRow?.t||0)*4)%17;ctx.beginPath();ctx.moveTo(ps[0].x,ps[0].y);for(let i=1;i<ps.length;i++)ctx.lineTo(ps[i].x,ps[i].y);ctx.stroke();}ctx.setLineDash([]);if(label){const m=ps[Math.floor(ps.length/2)];ctx.font="10.5px ui-monospace,monospace";ctx.fillStyle=q>1e-4?color:"#435763";ctx.fillText(label,m.x+5,m.y-5);}ctx.restore();}
function drawEngineeringOverlay(ctx,ed){
  const r=roof(),row=currentVisualRow;if(!r||!row)return;const top=(r.pos?.[2]||0)+(r.size?.[2]||.22),tank=activeTank(),drains=scene.objects.filter(o=>o.type==="drain"),overs=scene.objects.filter(o=>o.type==="overflow");
  ctx.save();ctx.font="10.5px ui-monospace,monospace";ctx.textAlign="left";
  // Parapet dimension at SW corner.
  const c=[(r.pos?.[0]||0)-r.size[0]/2,(r.pos?.[1]||0)-r.size[1]/2],pb=ed.project([c[0],c[1],top]),pt=ed.project([c[0],c[1],top+(r.parapetMm||0)/1000]);if(pb&&pt){ctx.strokeStyle="#5e727f";ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(pb.x-8,pb.y);ctx.lineTo(pt.x-8,pt.y);ctx.stroke();ctx.fillStyle="#445965";ctx.fillText(`${tr("parapet")} ${fmt(r.parapetMm,0)} mm`,pt.x-2,pt.y-4);}
  if(tank){const tz=tank.pos[2]+tank.size[2]-.12;for(const d of drains){const q=row.drainQ?.[d.id]||0,drop=Math.min(top-.45,tz+.35),pts=[[d.pos[0],d.pos[1],top+.04],[d.pos[0],d.pos[1],drop]];if(d.toTank){pts.push([tank.pos[0],d.pos[1],drop],[tank.pos[0],tank.pos[1],tz]);drawPipe(ctx,ed,pts,q,"#2f95d0",`${fmt(q,1)} l/s · ${tr("externalBoundary")}`);}else{const out=[d.pos[0],(r.pos?.[1]||0)-r.size[1]/2-2,drop-.7];pts.push(out);drawPipe(ctx,ed,pts,q,"#2f95d0",`${fmt(q,1)} l/s`);}}
    const sewer=[(r.pos?.[0]||0)+r.size[0]/2+4,(r.pos?.[1]||0)-r.size[1]/2-3,tank.pos[2]+.25];drawPipe(ctx,ed,[[tank.pos[0],tank.pos[1],tank.pos[2]+.35],[sewer[0],tank.pos[1],tank.pos[2]+.35],sewer],row.qt||0,"#60d7a3",`${tr("sewer")} ${fmt(row.qt||0,2)} l/s`);const sp=ed.project(sewer);if(sp){ctx.fillStyle="#37535f";ctx.fillText("⇣ SEWER",sp.x+4,sp.y+3);}
    if((row.qr||0)>1e-5){const reuse=[r.pos?.[0]||0,r.pos?.[1]||0,tank.pos[2]+.5];drawPipe(ctx,ed,[[tank.pos[0],tank.pos[1],tank.pos[2]+.55],reuse],row.qr,"#a18bd9",`${tr("reuse")} ${fmt(row.qr,2)} l/s`);}
    if((row.qto||0)>1e-5){const ovp=[sewer[0],sewer[1]-2,tank.pos[2]+1.2];drawPipe(ctx,ed,[[tank.pos[0],tank.pos[1],tank.pos[2]+tank.size[2]],[ovp[0],tank.pos[1],tank.pos[2]+tank.size[2]],ovp],row.qto,"#ff7474",`${tr("tankOverflow")} ${fmt(row.qto,1)} l/s`);}
  }
  for(const o of overs){
    snapOverflowToParapet(o);const v=overflowOutVector(o,r),shape=o.openingShape||"circular",n=Math.max(1,Math.round(o.count||1));
    const dimAlong=shape==="rectangular"?Math.max(.02,(o.widthMm||300)/1000):Math.max(.02,(o.diameterMm||120)/1000);
    const dimVert=shape==="rectangular"?Math.max(.02,(o.heightMm||120)/1000):Math.max(.02,(o.diameterMm||120)/1000);
    const spacing=Math.max(dimAlong*1.25,.18),along=(o.edge==="N"||o.edge==="S")?[1,0]:[0,1],q=row.overflowQ?.[o.id]||0;
    for(let k=0;k<n;k++){
      const off=(k-(n-1)/2)*spacing,x=o.pos[0]+along[0]*off,y=o.pos[1]+along[1]*off,z=top+(o.thresholdMm||0)/1000+dimVert/2,p=ed.project([x,y,z]);
      if(p){ctx.fillStyle="#edf5f8";ctx.strokeStyle=q>1e-5?"#ff6d6d":"#237faf";ctx.lineWidth=q>1e-5?2.5:1.5;
        if(shape==="rectangular"){
          const p1=ed.project([x-along[0]*dimAlong/2,y-along[1]*dimAlong/2,z-dimVert/2]),p2=ed.project([x+along[0]*dimAlong/2,y+along[1]*dimAlong/2,z+dimVert/2]);
          const ww=p1&&p2?Math.max(7,Math.hypot(p2.x-p1.x,p2.y-p1.y)):12,hh=Math.max(6,dimVert*28);ctx.fillRect(p.x-ww/2,p.y-hh/2,ww,hh);ctx.strokeRect(p.x-ww/2,p.y-hh/2,ww,hh);
        }else{const pv=ed.project([x,y,z+dimVert/2]),rr=pv?Math.max(3,Math.abs(pv.y-p.y)):5;ctx.beginPath();ctx.arc(p.x,p.y,rr,0,Math.PI*2);ctx.fill();ctx.stroke();}
      }
      if(q>1e-5)drawPipe(ctx,ed,[[x,y,z],[x+v[0]*1.8,y+v[1]*1.8,z-.45]],q/n,"#55b8ff","");
    }
    const lp=ed.project([o.pos[0],o.pos[1],top+(o.thresholdMm||0)/1000+dimVert+.08]);
    if(lp){const geom=shape==="rectangular"?`${n}×${fmt(o.widthMm||300,0)}×${fmt(o.heightMm||120,0)}`:`${n}×Ø${fmt(o.diameterMm||120,0)}`;ctx.fillStyle=q>1e-5?"#c94545":"#2a6d91";ctx.fillText(`${geom} · ${tr("overflowSill")} ${fmt(o.thresholdMm||0,0)} · Q ${fmt(q,1)} l/s`,lp.x+5,lp.y-3);}
  }
  ctx.restore();
}
function drawRainOverlay(ctx,ed){
  if(!scene)return;const s=state(),r=roof();if(!r)return;
  const to=windToVec(s.windFrom),ratio=s.windK*s.windSpeed/Math.max(.5,s.fallSpeed),L=8,dx=to[0]*L*ratio,dy=to[1]*L*ratio;
  ctx.save();ctx.strokeStyle="rgba(40,119,175,.28)";ctx.lineWidth=1.2;
  for(const fx of[-.4,-.15,.1,.35])for(const fy of[-.35,0,.35]){
    const end=[fx*r.size[0],fy*r.size[1],.3],start=[end[0]-dx,end[1]-dy,8.5],a=ed.project(start),b=ed.project(end);if(!a||!b)continue;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.restore();
}
function setupEditor(){
  editor=new DiagramSceneEditor($("sceneCanvas"),{snap:.5,planeZ:.24,gridSize:30,gridStep:2,camera:{az:-.8,el:.55,dist:48,target:[0,0,2]},
    onSelect:o=>renderInspector(o),
    onChange:()=>{scene.objects=scene.objects.filter(o=>!o._dynamic);renderObjectList();run(false)},
    onDelete:()=>{renderInspector(null);run(false)},
    onPlace:o=>{normalizeWall(o);renderInspector(o);renderObjectList();run(false)},
    onContextMenu:showContext,onObjectDrag:o=>{if(o.type==="overflow")snapOverflowToParapet(o);if(o.type==="tank")normalizeTank(o);},onChange:()=>{normalizeEngineeringObjects();run(false);},afterDraw:(ctx,ed)=>{drawSpatialOverlay(ctx,ed);drawRainOverlay(ctx,ed);drawEngineeringOverlay(ctx,ed);}});
  editor.setScene(scene);editor.frame();
}

function rebuildScenarios(preferred){
  const p=PACKS[$("jurisdiction").value||"BE-FL"],sel=$("scenario"),old=preferred||sel.value;
  sel.innerHTML=p.sc.map(k=>`<option value="${k}">${tr(k)}</option>`).join("");sel.value=p.sc.includes(old)?old:p.sc[0];
}
function applyI18n(){
  document.documentElement.lang=lang;
  const manifest=JSON.parse($("diagram-tool-manifest").textContent);$("appTitle").textContent=manifest.title[lang]||manifest.title.en;
  const jurValue=$("jurisdiction").value;if($("jurisdiction").options.length)$("jurisdiction").innerHTML=Object.entries(PACKS).map(([k,p])=>`<option value="${k}">${k} · ${jurText(k)} · ${packStandard(p)}</option>`).join("");if(PACKS[jurValue])$("jurisdiction").value=jurValue;
  document.querySelectorAll("[data-i18n]").forEach(e=>e.textContent=tr(e.dataset.i18n));
  rebuildScenarios($("scenario").value);
  const presetValue=$("preset").value;$("preset").innerHTML=PRESETS.map(p=>`<option value="${p.id}">${p.label[li()]||p.label[0]}</option>`).join("");if(PRESETS.some(p=>p.id===presetValue))$("preset").value=presetValue;
  renderObjectList();renderInspector(editor?.getSelected());if(last)renderResults(last);
  if(window.Diagram?.setDocumentLang)Diagram.setDocumentLang(lang);
  if(comparisonResults.length)renderComparison();
}
function loadPreset(){
  const p=PRESETS.find(q=>q.id===$("preset").value)||PRESETS[0];scene=p.make();normalizeEngineeringObjects();
  $("jurisdiction").value=p.jur;rebuildScenarios(p.event?.scenario);syncRoofInputs();const d=PACKS[p.jur].def,rp=rainProfile(p.jur);if(Number.isFinite(d.rain)){rp.rain=d.rain;rp.validRain=true;rp.source="code";rp.userEdited=false;}else if(p.event?.rain!=null&&!rp.userEdited){rp.rain=p.event.rain;rp.validRain=false;rp.source="project";}rp.duration=p.event?.duration??d.duration;loadRainControls(p.jur,false);
  editor.setScene(scene);editor.frame();lastTankReq=null;renderInspector(null);run(false);
}
function initSelectors(){
  $("lang").innerHTML=LANGS.map(k=>`<option value="${k}">${LANG_NAMES[k]}</option>`).join("");
  $("jurisdiction").innerHTML=Object.entries(PACKS).map(([k,p])=>`<option value="${k}">${k} · ${jurText(k)} · ${packStandard(p)}</option>`).join("");
  $("jurisdiction").value="BE-FL";rebuildScenarios();
}

function pythonExport(){
  if(!last)return{unsupported:"Run a simulation first."};
  const s=last.s,sceneLiteral=JSON.stringify(JSON.stringify(s.scene));
  const code=`import json, math
STATE=json.loads(${sceneLiteral})
REFERENCE_RAIN=${s.referenceRain??s.rain}; REFERENCE_DURATION=${s.referenceDuration??s.duration}; RAIN_FACTOR=${s.rainFactor??1}; DURATION_FACTOR=${s.durationFactor??1}
RAIN=REFERENCE_RAIN*RAIN_FACTOR; DURATION=REFERENCE_DURATION*DURATION_FACTOR; USER_DT=${s.dt}; WIND_SPEED=${s.windSpeed}; WIND_FROM=${s.windFrom}; FALL_SPEED=${s.fallSpeed}; WIND_K=${s.windK}; SCENARIO=${JSON.stringify(s.scenario)}; JURISDICTION=${JSON.stringify(s.jurisdiction)}
RHO=1000.0; GACC=9.80665

def clamp(v,a,b): return max(a,min(b,v))
def rad(d): return d*math.pi/180.0
def wind_to(d):
 a=rad((d+180)%360); return math.sin(a),math.cos(a)
def normal(d):
 a=rad(d%360); return math.sin(a),math.cos(a)
def primary_boundary(o):
 if SCENARIO=='blocked': return 0.0
 return max(0.0,o.get('externalFlowLps',o.get('capacityLps',0.0)))*(1-clamp(o.get('blockagePct',0),0,100)/100)
def overflow_q(o,free_mm):
 H=(free_mm-o.get('thresholdMm',0))/1000.0
 if H<=0:return 0.0
 Cd=max(.2,min(1.0,o.get('cd',.62))); nn=max(1,round(o.get('count',1))); shape=o.get('openingShape','circular')
 if shape=='rectangular':
  b=max(.02,o.get('widthMm',300)/1000.0); a=max(.02,o.get('heightMm',120)/1000.0); ymax=min(a,H)
  integ=(2.0/3.0)*math.sqrt(2*9.80665)*(H**1.5-max(0.0,H-ymax)**1.5)
  return Cd*nn*b*integ*1000
 D=max(.02,o.get('diameterMm',120)/1000.0); rr=D/2; ymax=min(D,H); N=24; dy=ymax/N; integ=0.0
 for i in range(N+1):
  y=i*dy; width=2*math.sqrt(max(0,rr*rr-(y-rr)*(y-rr))); vv=math.sqrt(2*9.80665*max(0,H-y)); ww=1 if i in (0,N) else (4 if i%2 else 2); integ+=ww*width*vv
 return Cd*nn*(dy/3)*integ*1000
def wall_factor(o):
 if not o.get('toRoof'): return 0.0
 dx,dy=wind_to(WIND_FROM); nx,ny=normal(o.get('azimuthDeg',0)); return WIND_K*WIND_SPEED/max(.5,FALL_SPEED)*max(0,-(dx*nx+dy*ny))*o.get('runoffC',.9)

def grid(objs):
 r=next(o for o in objs if o['type']=='roof'); L=max(2,r['size'][0]); W=max(2,r['size'][1]); target=clamp(r.get('cellM',1.5),.4,4); nx=int(clamp(math.floor(L/target+.5),4,60)); ny=int(clamp(math.floor(W/target+.5),4,60)); dx=L/nx; dy=W/ny; A=dx*dy; N=nx*ny; cx=r.get('pos',[0,0])[0]; cy=r.get('pos',[0,0])[1]; x0=cx-L/2; y0=cy-W/2; sx=r.get('slopeXmmM',0)/1000; sy=r.get('slopeYmmM',0)/1000; lows=[o for o in objs if o['type']=='lowspot']; z0=[0.0]*N
 for j in range(ny):
  for i in range(nx):
   k=j*nx+i; x=x0+(i+.5)*dx; y=y0+(j+.5)*dy; zz=sx*(x-cx)+sy*(y-cy)
   for o in lows:
    rr=max(.15,o.get('radiusM',2.5)); dd=o.get('depthMm',0)/1000; zz-=dd*math.exp(-.5*((x-o['pos'][0])**2+(y-o['pos'][1])**2)/(rr*rr))
   z0[k]=zz
 pairs=[]
 for j in range(ny):
  for i in range(nx):
   a=j*nx+i
   if i+1<nx:pairs.append((a,a+1,dx,dy))
   if j+1<ny:pairs.append((a,a+nx,dy,dx))
 def at(x,y): return int(clamp(math.floor((y-y0)/dy),0,ny-1))*nx+int(clamp(math.floor((x-x0)/dx),0,nx-1))
 return {'r':r,'L':L,'W':W,'nx':nx,'ny':ny,'dx':dx,'dy':dy,'A':A,'N':N,'cx':cx,'cy':cy,'x0':x0,'y0':y0,'z0':z0,'z':z0[:],'pairs':pairs,'at':at}

def basis(G,modes):
 M=int(clamp(round(modes or 5),1,9)); sx=[[math.sin((m+1)*math.pi*(i+.5)/G['nx']) for i in range(G['nx'])] for m in range(M)]; sy=[[math.sin((n+1)*math.pi*(j+.5)/G['ny']) for j in range(G['ny'])] for n in range(M)]; return M,sx,sy

def structural_raw(model,p,G,B,stiffness=1.0):
 M,sx,sy=B; w=[0.0]*G['N']; L=G['L']; W=G['W']; A=G['A']; stiff=max(1e-18,stiffness)
 if model=='rigid': return w
 if model=='oneX':
  for j in range(G['ny']):
   coeff=[]
   for mi in range(M):
    qm=sum(p[j*G['nx']+i]*sx[mi][i]*G['dx'] for i in range(G['nx']))*2/L; kk=(mi+1)*math.pi/L; coeff.append(qm/(stiff*kk**4))
   for i in range(G['nx']): w[j*G['nx']+i]=max(0.0,sum(coeff[mi]*sx[mi][i] for mi in range(M)))
  return w
 if model=='oneY':
  for i in range(G['nx']):
   coeff=[]
   for ni in range(M):
    qn=sum(p[j*G['nx']+i]*sy[ni][j]*G['dy'] for j in range(G['ny']))*2/W; kk=(ni+1)*math.pi/W; coeff.append(qn/(stiff*kk**4))
   for j in range(G['ny']): w[j*G['nx']+i]=max(0.0,sum(coeff[ni]*sy[ni][j] for ni in range(M)))
  return w
 coeff=[[0.0]*M for _ in range(M)]
 for mi in range(M):
  for ni in range(M):
   qmn=0.0
   for j in range(G['ny']):
    for i in range(G['nx']): qmn+=p[j*G['nx']+i]*sx[mi][i]*sy[ni][j]*A
   qmn*=4/(L*W); k2=((mi+1)*math.pi/L)**2+((ni+1)*math.pi/W)**2; coeff[mi][ni]=qmn/(stiff*k2*k2)
 for j in range(G['ny']):
  for i in range(G['nx']): w[j*G['nx']+i]=max(0.0,sum(coeff[mi][ni]*sx[mi][i]*sy[ni][j] for mi in range(M) for ni in range(M)))
 return w

def prepare_structure(G,force_rigid=False):
 r=G['r']; model='rigid' if force_rigid else r.get('structModel','rigid'); ref=max(0.0,r.get('structRefDeflMm',0)); B=basis(G,r.get('structModes',5))
 if model=='rigid' or ref<=0: return {'model':'rigid','B':B,'w':[0.0]*G['N'],'stiff':float('inf'),'update':float('inf'),'last':-1e99,'maxmm':0.0}
 unit=structural_raw(model,[1000.0]*G['N'],G,B,1.0); umax=max(unit) if unit else 0.0; stiff=umax/max(1e-9,ref/1000)
 return {'model':model,'B':B,'w':[0.0]*G['N'],'stiff':stiff,'update':clamp(r.get('structUpdateSec',5),1,60),'last':-1e99,'maxmm':0.0}

def update_structure(S,V,G,t):
 if S['model']=='rigid': return 0.0
 if t-S['last']<S['update']-1e-9: return S['maxmm']
 p=[RHO*GACC*(V[k]/G['A']) for k in range(G['N'])]; w=structural_raw(S['model'],p,G,S['B'],S['stiff']); S['w']=w; S['maxmm']=max(w,default=0.0)*1000; S['last']=t
 for k in range(G['N']): G['z'][k]=G['z0'][k]-w[k]
 return S['maxmm']

def sources(objs,G):
 r=G['r']; f=[RAIN*G['L']*G['W']/10000*r.get('runoffC',1)/G['N']]*G['N']; at=G['at']
 for o in objs:
  if o['type']=='wall' and o.get('toRoof'):
   area=o.get('widthM',o['size'][0])*o.get('heightM',o['size'][2]); qkin=RAIN*wall_factor(o)*area/10000; qnorm=RAIN*.5*area/10000 if JURISDICTION=='AR' else 0.0; q=max(qkin,qnorm); az=rad(o.get('azimuthDeg',0)); tx=math.cos(az); ty=-math.sin(az); ww=max(.1,o.get('widthM',o['size'][0])); ns=int(clamp(math.ceil(ww/max(.25,min(G['dx'],G['dy']))),3,40))
   for m in range(ns):
    u=((m+.5)/ns-.5)*ww; f[at(o['pos'][0]+tx*u,o['pos'][1]+ty*u)]+=q/ns
  elif o['type']=='catchment' and o.get('toRoof'):
   q=RAIN*o.get('areaM2',o['size'][0]*o['size'][1])/10000*o.get('runoffC',1)
   for jj in range(3):
    for ii in range(3): f[at(o['pos'][0]+((ii+.5)/3-.5)*o['size'][0],o['pos'][1]+((jj+.5)/3-.5)*o['size'][1])]+=q/9
 return f

def redistribute(V,G,dt,n,dead):
 eta=[G['z'][k]+V[k]/G['A'] for k in range(G['N'])]; mob=[max(0,V[k]/G['A']-dead) for k in range(G['N'])]; out=[0.0]*G['N']; moves=[]
 for a,b,dist,width in G['pairs']:
  de=eta[a]-eta[b]
  if abs(de)<1e-10: continue
  d,rc=(a,b) if de>0 else (b,a); h=mob[d]
  if h<=1e-7: continue
  dv=width/max(.01,n)*h**(5/3)*math.sqrt(abs(de)/dist)*dt; moves.append((d,rc,dv)); out[d]+=dv
 scale=[min(1,.45*max(0,V[k]-dead*G['A'])/out[k]) if out[k]>0 else 1 for k in range(G['N'])]; moved=0.0
 for d,rc,dv0 in moves:
  dv=dv0*scale[d]; V[d]-=dv; V[rc]+=dv; moved+=dv
 return moved

def take(V,G,k,q,dt,dead):
 dv=min(max(0,V[k]-dead*G['A']),q*dt/1000); V[k]-=dv; return dv*1000/dt

def emergency_target(objs,qin):
 qnormal=sum(primary_boundary(o) for o in objs if o['type']=='drain')
 if JURISDICTION in ('US','NL'): return max(0.0,qin)
 if JURISDICTION=='CA' and abs(DURATION-15.0)<0.01: return max(0.0,2.0*qin)
 if SCENARIO=='blocked': return max(0.0,qin)
 return max(0.0,qin-qnormal)

def emergency_capacity_at_parapet(objs,parapet_mm):
 return sum(overflow_q(o,parapet_mm) for o in objs if o['type']=='overflow')

def compute(force_rigid=False):
 objs=STATE['objects']; G=grid(objs); r=G['r']; field=sources(objs,G); drains=[o for o in objs if o['type']=='drain']; overs=[o for o in objs if o['type']=='overflow']; tank=next((o for o in objs if o['type']=='tank'),None); S=prepare_structure(G,force_rigid); V=[0.0]*G['N']; Vt=max(0,tank.get('initialM3',0)) if tank else 0; dead=max(0,r.get('deadMm',0))/1000; udt=clamp(USER_DT,.2,30); hdt=min(udt,1); rainT=max(60,DURATION*60); maxT=max(rainT+3600,48*3600); n=clamp(r.get('manningN',.035),.01,.3); maxH=maxVr=maxFlood=peakSite=maxDefl=0; maxVt=Vt; emergencyFirst=None; t=0; settled=False; lastT=0; lastVr=lastH=lastW=None; stable=0; quiet=0
 while t<=maxT+1e-9:
  spatial=t<rainT or not settled; raining=t<rainT; dt=hdt if raining else (min(8,max(udt,3)) if spatial else min(30,max(udt,2)))
  if raining:
   for k in range(G['N']): V[k]+=field[k]*dt/1000
  wmm=update_structure(S,V,G,t) if spatial else S['maxmm']; maxDefl=max(maxDefl,wmm); moved=redistribute(V,G,dt,n,dead) if spatial else 0; qpt=qpd=qe=0
  for o in drains:
   k=G['at'](o['pos'][0],o['pos'][1]); q=take(V,G,k,primary_boundary(o),dt,dead); qpt,qpd=(qpt+q,qpd) if o.get('toTank') and tank else (qpt,qpd+q)
  for o in overs:
   k=G['at'](o['pos'][0],o['pos'][1]); h=V[k]/G['A']*1000; free=h+(G['z'][k]-G['z0'][k])*1000; qe+=take(V,G,k,overflow_q(o,free),dt,dead)
  if qe>1e-9 and emergencyFirst is None: emergencyFirst=t
  qt=qr=qto=0
  if tank:
   Vt+=qpt*dt/1000; cap=max(0,tank.get('capacityM3',0)); release_on=t>=max(0,tank.get('releaseDelayMin',0))*60; qt=min(max(0,tank.get('throttleLps',0)),Vt*1000/dt) if release_on else 0.0; Vt-=qt*dt/1000; qr=min(max(0,tank.get('reuseLps',0)),Vt*1000/dt) if release_on else 0.0; Vt-=qr*dt/1000
   if Vt>cap:qto=(Vt-cap)*1000/dt;Vt=cap
  Vr=sum(V); h=max((v/G['A']*1000 for v in V),default=0); flood=sum(G['A'] for v in V if v/G['A']*1000>10); site=qpd+qe+qt+qto; maxH=max(maxH,h); maxVr=max(maxVr,Vr); maxVt=max(maxVt,Vt); maxFlood=max(maxFlood,flood); peakSite=max(peakSite,site)
  if t>rainT and t-lastT>=60:
   stable=stable+1 if lastVr is not None and abs(Vr-lastVr)<1e-3 and abs(h-lastH)<.1 and abs(wmm-lastW)<.1 else 0; lastVr,lastH,lastW,lastT=Vr,h,wmm,t; settled=settled or stable>=3
  if t>rainT:
   rate=moved/max(dt,1e-9)+(qpt+qpd+qe)/1000; quiet=quiet+dt if rate<1e-6 else 0; settled=settled or quiet>=120
   if settled and ((not tank or Vt<1e-7) or (tank and tank.get('throttleLps',0)+tank.get('reuseLps',0)<=1e-12)): break
  t+=dt
 return {'max_roof_depth_mm':maxH,'max_roof_storage_m3':maxVr,'max_tank_volume_m3':maxVt,'peak_site_discharge_lps':peakSite,'peak_flooded_area_m2':maxFlood,'max_structural_deflection_mm':maxDefl,'emergency_first_min':None if emergencyFirst is None else emergencyFirst/60.0}

def all_results():
 main=compute(False); rigid=compute(True); main['rigid_roof_max_depth_mm']=rigid['max_roof_depth_mm']; main['ponding_amplification']=main['max_roof_depth_mm']/rigid['max_roof_depth_mm'] if rigid['max_roof_depth_mm']>1e-12 else 1.0
 objs=STATE['objects']; G=grid(objs); qin=sum(sources(objs,G)); roof=next(o for o in objs if o['type']=='roof')
 main['normal_drain_external_boundary_lps']=sum(primary_boundary(o) for o in objs if o['type']=='drain')
 main['emergency_required_lps']=emergency_target(objs,qin)
 main['emergency_capacity_at_parapet_lps']=emergency_capacity_at_parapet(objs,roof.get('parapetMm',0))
 return main

COMPARISON_CASES=json.loads(${JSON.stringify(JSON.stringify(comparisonResults.filter(x=>x.event).map(x=>({jurisdiction:x.code,scenario:x.scenario,rain:x.event.rain,duration:x.event.duration,expected_status:x.status}))))})
def compare_codes():
 global RAIN,DURATION,JURISDICTION,SCENARIO
 saved=(RAIN,DURATION,JURISDICTION,SCENARIO); out=[]; cache={}
 try:
  for c in COMPARISON_CASES:
   RAIN=float(c['rain']); DURATION=float(c['duration']); JURISDICTION=c['jurisdiction']; SCENARIO=c['scenario']; key=(round(RAIN,8),round(DURATION,8),SCENARIO,'AR' if JURISDICTION=='AR' else 'GEN')
   if key not in cache: cache[key]=compute(False)
   r=cache[key]
   out.append({'jurisdiction':JURISDICTION,'scenario':SCENARIO,'rain_lps_ha':RAIN,'duration_min':DURATION,'max_depth_mm':r['max_roof_depth_mm'],'max_tank_m3':r['max_tank_volume_m3'],'peak_site_lps':r['peak_site_discharge_lps'],'browser_profile_status':c['expected_status']})
 finally:
  RAIN,DURATION,JURISDICTION,SCENARIO=saved
 return out
if __name__=='__main__':
 print(all_results())
 if COMPARISON_CASES: print(json.dumps({'code_comparison':compare_codes()},indent=2))
`;
  return{code,requires:[],basis:{kind:"reproduce",note:"Ports the same conservative 2D diffusive-wave roof grid, externally prescribed normal-drain boundary flows, circular/rectangular emergency-overflow hydraulics, wall-rain sources, buffer-tank balance and calibrated modal structural ponding feedback as the browser. If a code comparison was run, the script also recomputes its physical columns; the browser profile status label is carried as metadata because the compliance layer contains cited jurisdiction-specific rule logic.",deviation:"IEEE-754 and math-library last-bit differences only."},selftest:{tolerance:2e-6,note:"Same grid generation, modal structural response and explicit conservative transfers."},displayed:{max_roof_depth_mm:last.maxH,max_roof_storage_m3:last.maxVr,max_tank_volume_m3:last.maxVt,peak_site_discharge_lps:last.peakSite,peak_flooded_area_m2:last.maxFloodArea,max_structural_deflection_mm:last.maxDefl,rigid_roof_max_depth_mm:last.rigidMaxH,ponding_amplification:last.pondingAmplification,emergency_first_min:last.emergencyFirst==null?null:last.emergencyFirst/60,normal_drain_external_boundary_lps:primaryBoundaryTotal(last.s),emergency_required_lps:emergencySizing(last).qReq,emergency_capacity_at_parapet_lps:emergencySizing(last).qAvail},covers:["max_roof_depth_mm","max_roof_storage_m3","max_tank_volume_m3","peak_site_discharge_lps","peak_flooded_area_m2","max_structural_deflection_mm","rigid_roof_max_depth_mm","ponding_amplification","emergency_first_min","normal_drain_external_boundary_lps","emergency_required_lps","emergency_capacity_at_parapet_lps"]};
}
function initDiagram(){
  if(!window.Diagram)return;
  Diagram.init({
    id:"roofstormwater",file:"roofstormwater.html",title:"Roof Stormwater Studio",
    state:{serialize:()=>state(),deserialize:setState},
    record:()=>last?{inputs:{jurisdiction:last.s.jurisdiction,scenario:last.s.scenario,reference_rain_lps_ha:last.s.referenceRain,reference_duration_min:last.s.referenceDuration,rain_intensity_factor:last.s.rainFactor,duration_factor:last.s.durationFactor,rain_lps_ha:last.s.rain,duration_min:last.s.duration,wind_speed_mps:last.s.windSpeed,wind_from_deg:last.s.windFrom,scene:last.s.scene},outputs:{max_roof_depth_mm:last.maxH,max_roof_storage_m3:last.maxVr,max_tank_volume_m3:last.maxVt,required_tank_m3:lastTankReq,peak_site_discharge_lps:last.peakSite,wall_runoff_m3:last.volWall,peak_flooded_area_m2:last.maxFloodArea,max_parapet_overtopping_mm:last.maxEdgeExcess,max_structural_deflection_mm:last.maxDefl,rigid_roof_max_depth_mm:last.rigidMaxH,ponding_amplification:last.pondingAmplification,emergency_first_min:last.emergencyFirst==null?null:last.emergencyFirst/60,normal_drain_external_boundary_lps:primaryBoundaryTotal(last.s),emergency_capacity_at_parapet_lps:emergencySizing(last).qAvail,emergency_required_current_storm_lps:emergencySizing(last).qReq,emergency_opening_sizing:overflowSizingSummary(last),tank_sewer_volume_m3:last.volThrottle||0,reuse_volume_m3:last.volReuse||0,hydraulic_grid:`${last.grid.nx}x${last.grid.ny}`},units:{max_roof_depth_mm:"mm",max_roof_storage_m3:"m3",max_tank_volume_m3:"m3",required_tank_m3:"m3",peak_site_discharge_lps:"l/s",wall_runoff_m3:"m3",peak_flooded_area_m2:"m2",max_parapet_overtopping_mm:"mm",max_structural_deflection_mm:"mm",rigid_roof_max_depth_mm:"mm",ponding_amplification:"1",emergency_first_min:"min",normal_drain_external_boundary_lps:"l/s",emergency_capacity_at_parapet_lps:"l/s",emergency_required_current_storm_lps:"l/s",tank_sewer_volume_m3:"m3",reuse_volume_m3:"m3"},model:{roof_cells:"dVi/dt = qrain,i + sum(Qj->i) - sum(Qi->j) - Qnormal_external,i - Qoverflow,i",normal_drainage:"external verified flow boundary only; gravity/siphonic network hydraulics are outside scope",emergency_overflow:"circular or rectangular parapet opening hydraulics solved from free-surface level, geometry and Cd",lateral_sheet_flow:"q = b/n * h^(5/3) * sqrt(abs(dEta)/L), Eta = z0 - w + h",roof_surface:`slopeX=${last.roof.slopeXmmM||0} mm/m; slopeY=${last.roof.slopeYmmM||0} mm/m; cell=${last.roof.cellM||1.5} m; Manning n=${last.roof.manningN||.035}`,structural_ponding:`model=${last.structure?.model||"rigid"}; calibrated max deflection at uniform 1 kPa=${last.roof.structRefDeflMm||0} mm; modes=${last.roof.structModes||5}`,tank_balance:"dVt/dt = Qto_tank - Qsewer_throttle - Qreuse - Qoverflow",wall_rain:"Rwall = Rh*k*U/vfall*max(0,-dwind·nwall)",code_pack_status:PACKS[last.s.jurisdiction].tier,code_pack_sources:PACKS[last.s.jurisdiction].sources,code_profile_checks:codeSpecificChecks(last).map(q=>({status:q.k,check:q.a,result:q.b})),code_comparison:comparisonResults.map(x=>({jurisdiction:x.code,status:x.status,event:x.event?{rain_lps_ha:x.event.rain,duration_min:x.event.duration}:null,max_depth_mm:x.res?.maxH??null,max_tank_m3:x.res?.maxVt??null,peak_site_lps:x.res?.peakSite??null}))},warnings:["Prototype code packs are not yet complete compliance implementations.","Normal drainage hydraulics is explicitly outside scope. Primary drain objects are externally verified flow boundary conditions from a separate gravity/siphonic design.","Wind-driven wall rain is kinematic, not façade CFD.","Structural feedback is a reduced-order simply-supported elastic model calibrated by a user-supplied 1 kPa deflection; it does not verify member strength, deck buckling, connections or geometric nonlinearity."]}:null,
    python:pythonExport,
    handoff:{provides:[],accepts:[]},
    report:{sections:()=>last?[
      {title:tr("profile"),head:[tr("item"),tr("value")],rows:[
        [tr("jurisdiction"),`${jurText(last.s.jurisdiction)} · ${packStandard(PACKS[last.s.jurisdiction])}`],
        [tr("profileMaturity"),packStatusText(PACKS[last.s.jurisdiction])],
        [tr("rainBasis"),packBasisText(PACKS[last.s.jurisdiction])],
        [tr("referenceSource"),rainReferenceLabel(last.s.jurisdiction)],
        [tr("currentEvent"),`${fmt(last.s.rain*.36,1)} mm/h · ${fmt(last.s.duration,0)} min`],
        [tr("sourceBasis"),PACKS[last.s.jurisdiction].sources.join("; ")]
      ]},
      {title:tr("engineeringCalc"),head:[tr("item"),tr("value")],rows:[
        [tr("roofArea"),`${fmt(last.A,1)} m²`],[tr("parapet"),`${fmt(last.roof.parapetMm||0,0)} mm`],[tr("primaryFlow"),last.s.scene.objects.filter(o=>o.type==="drain").map(o=>`#${o.id}: Qexternal=${fmt(o.externalFlowLps??0,2)} l/s · ${o.toTank?tr("primaryToTank"):tr("primaryDirect")}`).join("; ")||"—"],[tr("firstEmergency"),last.emergencyFirst==null?"—":`${fmt(last.emergencyFirst/60,2)} min`],[tr("overflowGeometry"),last.s.scene.objects.filter(o=>o.type==="overflow").map(o=>(o.openingShape||"circular")==="rectangular"?`${o.count||1}×${fmt(o.widthMm||300,0)}×${fmt(o.heightMm||120,0)} mm · sill ${fmt(o.thresholdMm||0,0)} mm · Cd ${fmt(o.cd??.62,2)}`:`${o.count||1}×Ø${fmt(o.diameterMm||120,0)} mm · sill ${fmt(o.thresholdMm||0,0)} mm · Cd ${fmt(o.cd??.62,2)}`).join("; ")||"—"],[tr("requiredEmergency"),`${fmt(emergencySizing(last).qAvail,2)} available / ${fmt(emergencySizing(last).qReq,2)} required l/s @ parapet crest`],[tr("requiredOpenings"),overflowSizingSummary(last).map(z=>z.shape==="rectangular"?`#${z.id}: ${z.required_count_current_size} × ${fmt(z.width_mm,0)}×${fmt(z.height_mm,0)} mm; width@N=${fmt(z.required_width_mm_current_count,0)} mm`:`#${z.id}: ${z.required_count_current_size} × Ø${fmt(z.diameter_mm,0)} mm; Ø@N=${fmt(z.required_diameter_mm_current_count,0)} mm`).join("; ")||"—"],[tr("tankThrottleOnly"),last.tank?`${fmt(last.tank.throttleLps||0,2)} l/s · tank below roof · V=${fmt(last.tank.capacityM3||0,2)} m³`:"—"],
        [tr("referenceEvent"),`${fmt(last.s.referenceRain??last.s.rain,1)} l/s·ha · ${fmt(last.s.referenceDuration??last.s.duration,0)} min`],
        [tr("intensityFactor"),`× ${fmt(last.s.rainFactor??1,3)}`],
        [tr("durationFactor"),`× ${fmt(last.s.durationFactor??1,3)}`],
        [tr("appliedEvent"),`${fmt(last.s.rain,1)} l/s·ha = ${fmt(last.s.rain*.36,1)} mm/h · ${fmt(last.s.duration,0)} min → ${fmt(last.s.rain*.36*last.s.duration/60,1)} mm`],
        ["Qdirect = i·A·C/10000",`${fmt(last.s.rain,2)} × ${fmt(last.A,1)} × ${fmt(last.roof.runoffC??1,3)} / 10000 = ${fmt(last.s.rain*last.A*(last.roof.runoffC??1)/10000,3)} l/s`],
        ["ΣV balance",`Vdirect ${fmt(last.volDirect,3)} + Vwall ${fmt(last.volWall,3)} + Vupper ${fmt(last.volUpper,3)} m³`],
        ["Roof solver",`dVᵢ/dt = qrain,ᵢ + ΣQj→i − ΣQi→j − Qdrain,ᵢ − Qoverflow,ᵢ · grid ${last.grid.nx}×${last.grid.ny}`],
        ["Tank solver",last.tank?`dVt/dt = Qin − Qthrottle − Qreuse − Qoverflow · Vcap ${fmt(last.tank.capacityM3||0,2)} m³`:"—"],
        ["Structural feedback",`model ${last.structure?.model||"rigid"} · wmax ${fmt(last.maxDefl,2)} mm`]
      ]},
      {title:tr("results"),head:[tr("quantity"),tr("result")],rows:[
        [tr("maxDepth"),`${fmt(last.maxH,1)} mm`],
        [tr("maxRoofV"),`${fmt(last.maxVr,2)} m³`],
        [tr("maxTankV"),`${fmt(last.maxVt,2)} m³`],
        [tr("peakOut"),`${fmt(last.peakSite,2)} l/s`],
        [tr("maxDeflection"),`${fmt(last.maxDefl,1)} mm`],
        [tr("pondingAmp"),`${fmt(last.pondingAmplification,3)} ×`],
        [tr("balanceResidual"),`${fmt(last.volDirect+last.volWall+last.volUpper-last.volDirectPrimary-last.volE-last.volTankOverflow-last.volControlled-last.storedEnd,6)} m³`]
      ]},
      {title:tr("generalChecks"),head:[tr("status"),tr("checks"),tr("result")],rows:generalChecksFor(last).map(q=>[q.k.toUpperCase(),q.a,q.b])},
      {title:tr("massBalance"),head:[tr("item"),tr("value")],rows:[
        [tr("directRain"),`${fmt(last.volDirect,3)} m³`],[tr("wallVolume"),`${fmt(last.volWall,3)} m³`],[tr("upperIn"),`${fmt(last.volUpper,3)} m³`],[tr("directPrimary"),`${fmt(last.volDirectPrimary,3)} m³`],[tr("emergencyOut"),`${fmt(last.volE,3)} m³`],[tr("tankOverflow"),`${fmt(last.volTankOverflow,3)} m³`],[tr("throttleVolume"),`${fmt(last.volThrottle||0,3)} m³`],[tr("reuseVolume"),`${fmt(last.volReuse||0,3)} m³`],[tr("storedEnd"),`${fmt(last.storedEnd,3)} m³`],[tr("balanceResidual"),`${fmt(last.volDirect+last.volWall+last.volUpper-last.volDirectPrimary-last.volE-last.volTankOverflow-last.volControlled-last.storedEnd,9)} m³`]
      ]},
      {title:tr("codeChecks"),head:[tr("status"),tr("checks"),tr("result")],rows:codeSpecificChecks(last).map(q=>[q.k.toUpperCase(),q.a,q.b]),notes:[tr("sourceNote")]},
      ...(comparisonResults.length?[{title:tr("compareCodes"),head:[tr("comparisonResult"),tr("comparisonCode"),tr("comparisonEvent"),tr("comparisonDepth"),tr("comparisonTank"),tr("comparisonPeak")],rows:comparisonResults.map(x=>[comparisonLabel(x.status),x.code+" · "+jurText(x.code),x.event?`${fmt(x.event.rain*.36,1)} mm/h · ${fmt(x.event.duration,0)} min`:tr("inputNeeded"),x.res?`${fmt(x.res.maxH,1)} mm`:"—",x.res?`${fmt(x.res.maxVt,1)} m³`:"—",x.res?`${fmt(x.res.peakSite,1)} l/s`:"—"]),notes:[tr("compareFoot")]}]:[]),
      {title:tr("scene3d"),image:$("sceneCanvas").toDataURL("image/png")},
      {title:tr("hydrograph"),image:$("hydroChart").toDataURL("image/png")},
      {title:tr("windRoseTitle"),image:$("windRose").toDataURL("image/png")},
      ...(last.s.jurisdiction==="AR"?[{title:tr("minuteTable"),head:["min",`${tr("rainInflow")} l/s`,`${tr("roofStorage")} m³`,`${tr("tank")} m³`,`${tr("siteOut")} l/s`],rows:last.rows.filter((r,i,a)=>i===0||Math.floor(r.t/60)!==Math.floor(a[i-1].t/60)).slice(0,180).map(r=>[fmt(r.t/60,0),fmt(r.qin,2),fmt(r.Vr,2),fmt(r.Vt,2),fmt(r.site,2)])}]:[])
    ]:[]}
  });
}

window.RoofStormwaterCore={baseScene,buildSpatialGrid,buildSourceField,prepareStructure,structuralResponseRaw,updateStructure,simulate,requiredTank,inflowComponents,codeSpecificChecks,generalChecksFor,complianceFor,comparisonEventFor,PACKS,minSpainDrains,overflowFlowLps,emergencySizing,testPython:s=>{last=simulate(s);if(last.structure?.model!=="rigid"){const rr=simulate(s,{forceRigid:true});last.rigidMaxH=rr.maxH;last.pondingAmplification=rr.maxH>1e-9?last.maxH/rr.maxH:1;}else{last.rigidMaxH=last.maxH;last.pondingAmplification=1;}return pythonExport();}};

document.addEventListener("DOMContentLoaded",()=>{
  scene=makeFlandersPreset();normalizeEngineeringObjects();
  initSelectors();rebuildScenarios(PRESETS[0].event.scenario);const rp0=rainProfile(PRESETS[0].jur);rp0.rain=PRESETS[0].event.rain;rp0.duration=PRESETS[0].event.duration;rp0.validRain=Number.isFinite(PACKS[PRESETS[0].jur].def.rain);rp0.source=rp0.validRain?"code":"project";loadRainControls(PRESETS[0].jur,false);$("dt").value=2;$("windSpeed").value=8;$("windFrom").value=240;$("fallSpeed").value=7;$("windK").value=.6;
  syncRoofInputs();setupEditor();

  $("lang").onchange=()=>{lang=$("lang").value;try{localStorage.setItem("diagram_lang",lang)}catch{}applyI18n();run(false)};
  $("jurisdiction").onchange=()=>{saveRainControls();rebuildScenarios();loadRainControls($("jurisdiction").value,true);run(false)};
  $("scenario").onchange=()=>run(false);$("loadPreset").onclick=loadPreset;
  for(const id of["roofL","roofW","parapet","dead","roofC","slopeX","slopeY","cellSize","manning","structModel","structRef","structUpdate","structModes","deflAlert","dt","windSpeed","windFrom","fallSpeed","windK"])$(id).onchange=()=>run(false);
  $("refRain").onchange=()=>{markReferenceEdited();run(false)};$("refDuration").onchange=()=>{const rp=rainProfile($("jurisdiction").value);rp.rain=Math.max(0,num("refRain",rp.rain));rp.duration=Math.max(1,num("refDuration",rp.duration));rp.validRain=rp.rain>0;rp.userEdited=true;rp.source="project";syncAppliedFromFactors();run(false)};
  $("rainFactor").onchange=()=>{syncAppliedFromFactors();run(false)};$("durationFactor").onchange=()=>{syncAppliedFromFactors();run(false)};
  $("rain").onchange=()=>{syncFactorsFromApplied();run(false)};$("duration").onchange=()=>{syncFactorsFromApplied();run(false)};$("resetRain").onclick=resetRainFactors;
  $("compareRun").onclick=runCodeComparison;$("compareMode").onchange=()=>{comparisonModeLast=$("compareMode").value;};
  $("worstWind").onclick=worstWindDirection;$("fitScene").onclick=()=>editor.frame();$("cancelPlace").onclick=()=>editor.cancelPlacement();$("run").onclick=()=>run(true);$("sizeTank").onclick=sizeTankNow;if($("playPause"))$("playPause").onclick=()=>{if(!last)return;if(timelinePlaying){animationToken++;setTimelinePlaying(false);}else{animate(last);}};if($("timelineRange"))$("timelineRange").oninput=e=>{animationToken++;setTimelinePlaying(false);showTimelineFrame(Number(e.target.value));};
  document.querySelectorAll(".tool").forEach(b=>b.onclick=()=>placement(b.dataset.kind));
  document.addEventListener("pointerdown",e=>{if(!$("context").contains(e.target))$("context").style.display="none"});
  window.addEventListener("keydown",e=>{if(e.key==="Escape")editor.cancelPlacement();if((e.key==="Delete"||e.key==="Backspace")&&!["INPUT","SELECT","TEXTAREA"].includes(document.activeElement?.tagName))editor.deleteSelected()});
  window.addEventListener("resize",()=>last&&(drawHydro(last),drawWindRose(last.s)));

  let saved="en";try{saved=new URLSearchParams(location.search).get("lang")||localStorage.getItem("diagram_lang")||navigator.language?.slice(0,2)||"en"}catch{}
  if(!LANGS.includes(saved))saved="en";lang=saved;$("lang").value=lang;
  applyI18n();run(false);initDiagram();
});
})();
