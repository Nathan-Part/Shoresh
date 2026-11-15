/**
 * Appels Shoresh 2026 : stockage de la liste commune dans un Google Sheet.
 *
 * Installation (une seule fois) : colle ce code tel quel, enregistre, puis
 * Déployer > Nouveau déploiement > Application Web. Exécuter en tant que : Moi. Qui a accès : Tout le monde.
 * Copie l'URL de l'application Web (elle finit par /exec).
 *
 * Code d'équipe : le premier code entré sur le site devient le code de l'équipe.
 * Pour le changer : Paramètres du projet (roue dentée) > Propriétés du script > modifier « code ».
 *
 * Le tableur « Appels Shoresh 2026 (liste) » est créé dans ton Google Drive au premier usage.
 * Ne modifie pas ses lignes à la main : le site lit la colonne « data ».
 */
const CODE_EQUIPE = '';   // facultatif : un code fixé ici remplace celui choisi sur le site

const ENTETES = ['Nom', 'Téléphone', 'Résultat', 'Promis (€)', 'Donné (€)', 'Moyen', 'Attribué à', 'Appelé par', 'Mis à jour', 'Note', 'id', 'data'];
const COL_ID = 10, COL_DATA = 11;
const RESULTATS = {
  a_appeler: 'À appeler', sans_reponse: 'Pas de réponse', rappeler: 'À rappeler',
  promesse: 'Va donner', donne: 'A donné', refus: 'Refus', invalide: 'Mauvais numéro',
};

/* Lecture : toute la liste, ou « inchange » si rien n'a bougé depuis la version que le site connaît */
function doGet(e) {
  const p = (e && e.parameter) || {};
  const refus = verifier(p.code);
  if (refus) return json(refus);
  const rev = revActuelle();
  if (p.rev && p.rev === rev) return json({ok: true, rev: rev, inchange: true});
  return json({ok: true, rev: rev, contacts: lireContacts(), config: lireConfig(), nouveauCode: codeCree});
}

/* Écriture : un lot d'opérations { op: set | update | delete | config, id, data } */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ok: false, erreur: 'requete'}); }
  const refus = verifier(req.code);
  if (refus) return json(refus);
  const ops = Array.isArray(req.ops) ? req.ops : [];
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(25000)) return json({ok: false, erreur: 'occupe'});
  try {
    const contacts = new Map(lireContacts().map(c => [c.id, c.data]));
    let config = null, contactsChange = false;
    const resultats = ops.map(op => {
      if (!op || typeof op !== 'object') return {ok: false, erreur: 'requete'};
      if (op.op === 'config') {
        if (!estObjet(op.data)) return {ok: false, erreur: 'requete'};
        config = op.data;
        return {ok: true};
      }
      const id = String(op.id || '');
      if (!/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) return {ok: false, erreur: 'requete'};
      if (op.op === 'set') {
        if (!estObjet(op.data)) return {ok: false, erreur: 'requete'};
        contacts.set(id, op.data); contactsChange = true;
        return {ok: true};
      }
      if (op.op === 'update') {
        if (!estObjet(op.data)) return {ok: false, erreur: 'requete'};
        if (!contacts.has(id)) return {ok: false, erreur: 'absent'};
        contacts.set(id, Object.assign({}, contacts.get(id), op.data)); contactsChange = true;
        return {ok: true};
      }
      if (op.op === 'delete') {
        if (contacts.delete(id)) contactsChange = true;
        return {ok: true};
      }
      return {ok: false, erreur: 'requete'};
    });
    if (contactsChange) ecrireContacts(contacts);
    if (config) ecrireConfig(config);
    const rev = (contactsChange || config) ? nouvelleRev() : revActuelle();
    return json({ok: true, rev: rev, resultats: resultats});
  } finally {
    verrou.releaseLock();
  }
}

let codeCree = false;
function verifier(code) {
  code = String(code || '').trim();
  const props = PropertiesService.getScriptProperties();
  const attendu = (CODE_EQUIPE && CODE_EQUIPE !== 'a-changer') ? CODE_EQUIPE : (props.getProperty('code') || '');
  if (attendu) return code === attendu ? null : {ok: false, erreur: 'code'};
  /* Aucun code encore : le premier code reçu devient celui de l'équipe, et le tableur est créé */
  if (code.length < 4) return {ok: false, erreur: 'code_court'};
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(10000)) return {ok: false, erreur: 'occupe'};
  try {
    if (!props.getProperty('code')) { props.setProperty('code', code); codeCree = true; classeur(); }
    return props.getProperty('code') === code ? null : {ok: false, erreur: 'code'};
  } finally {
    verrou.releaseLock();
  }
}
/* Le tableur auquel le script est rattaché, sinon celui qu'il a créé dans le Drive */
function classeur() {
  const actif = SpreadsheetApp.getActiveSpreadsheet();
  if (actif) return actif;
  const props = PropertiesService.getScriptProperties(), id = props.getProperty('classeur');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Appels Shoresh 2026 (liste)');
  props.setProperty('classeur', ss.getId());
  return ss;
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function estObjet(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function revActuelle() { return PropertiesService.getScriptProperties().getProperty('rev') || '0'; }
function nouvelleRev() {
  const rev = String(Number(revActuelle()) + 1);
  PropertiesService.getScriptProperties().setProperty('rev', rev);
  return rev;
}

function feuille() {
  const ss = classeur();
  const sh = ss.getSheetByName('Contacts') || ss.insertSheet('Contacts');
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, ENTETES.length).setValues([ENTETES]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function lireContacts() {
  const sh = feuille(), n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, ENTETES.length).getValues().map(r => {
    if (!r[COL_ID]) return null;
    try { return {id: String(r[COL_ID]), data: JSON.parse(r[COL_DATA])}; } catch (err) { return null; }
  }).filter(Boolean);
}
function ecrireContacts(contacts) {
  const sh = feuille(), n = sh.getLastRow();
  if (n > 1) sh.getRange(2, 1, n - 1, ENTETES.length).clearContent();
  const tz = Session.getScriptTimeZone();
  const lignes = Array.from(contacts.entries())
    .sort((a, b) => (Number(a[1].ordre) || 0) - (Number(b[1].ordre) || 0))
    .map(([id, d]) => [
      d.nom || '', d.tel || '', RESULTATS[d.statut] || 'À appeler',
      Number(d.promis) || '', Number(d.donne) || '', d.moyen || '', d.pour || '', d.par || '',
      d.maj ? Utilities.formatDate(new Date(d.maj), tz, 'dd/MM/yyyy HH:mm') : '',
      d.note || '', id, JSON.stringify(d),
    ]);
  if (lignes.length) {
    const r = sh.getRange(2, 1, lignes.length, ENTETES.length);
    r.setNumberFormat('@');   // texte brut : garde le « + » des numéros et n'interprète aucune formule
    r.setValues(lignes);
  }
}
function lireConfig() {
  const sh = classeur().getSheetByName('Config');
  if (!sh) return null;
  try { return JSON.parse(sh.getRange(1, 1).getValue()); } catch (err) { return null; }
}
function ecrireConfig(config) {
  const ss = classeur();
  const sh = ss.getSheetByName('Config') || ss.insertSheet('Config');
  const r = sh.getRange(1, 1);
  r.setNumberFormat('@');
  r.setValue(JSON.stringify(config));
}
