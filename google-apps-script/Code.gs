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
 * Code personnel : chaque membre choisit le sien (4 à 8 chiffres) à sa première connexion.
 * Le script refuse toute modification faite au nom de quelqu'un sans son code personnel,
 * et seul le responsable de la campagne peut changer l'objectif, le lien de don et le responsable.
 * Code personnel oublié : le responsable le réinitialise depuis l'onglet Équipe du site.
 * Celui du responsable : Propriétés du script > supprimer la ligne « membre:prénom nom ».
 *
 * Le tableur « Appels Shoresh 2026 (liste) » est créé dans ton Google Drive au premier usage.
 * Ne modifie pas ses lignes à la main : le site lit la colonne « data ».
 */
const VERSION = 2;
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
  if (p.rev && p.rev === rev) return json({ok: true, version: VERSION, rev: rev, inchange: true});
  return json({ok: true, version: VERSION, rev: rev, contacts: lireContacts(), config: lireConfig(), membres: listeMembres(), nouveauCode: codeCree});
}

/* Écriture : { code, qui, pin, ops: [{ op: set | update | delete | config | inscrire | connexion | reinitialiser, … }] } */
function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json({ok: false, erreur: 'requete'}); }
  const refus = verifier(req.code);
  if (refus) return json(refus);
  const ops = Array.isArray(req.ops) ? req.ops : [];
  const verrou = LockService.getScriptLock();
  if (!verrou.tryLock(25000)) return json({ok: false, erreur: 'occupe'});
  try {
    /* Créer son code personnel ou le vérifier : pas besoin d'être déjà connecté */
    if (ops.length === 1 && ops[0] && (ops[0].op === 'inscrire' || ops[0].op === 'connexion')) {
      const op = ops[0], r = op.op === 'inscrire' ? inscrireMembre(op.nom, op.pin) : verifierMembre(op.nom, op.pin);
      if (r.ok && op.op === 'inscrire') return json({ok: true, rev: nouvelleRev(), resultats: [r]});
      return json({ok: true, rev: revActuelle(), resultats: [r]});
    }
    /* Toute autre modification se fait au nom d'un membre, avec son code personnel */
    const auth = verifierMembre(req.qui, req.pin);
    if (!auth.ok) return json({ok: false, erreur: auth.erreur});
    const auteur = auth.nom;
    const contacts = new Map(lireContacts().map(c => [c.id, c.data]));
    const ancienneConfig = lireConfig() || {};
    let config = null, contactsChange = false, membresChange = false;
    const resultats = ops.map(op => {
      if (!op || typeof op !== 'object') return {ok: false, erreur: 'requete'};
      if (op.op === 'config') {
        if (!estObjet(op.data)) return {ok: false, erreur: 'requete'};
        const base = config || ancienneConfig;
        if (!configAutorisee(base, op.data, auteur)) return {ok: false, erreur: 'responsable'};
        config = op.data;
        return {ok: true};
      }
      if (op.op === 'reinitialiser') {
        const resp = String(ancienneConfig.responsable || '');
        if (!resp || cle(resp) !== cle(auteur)) return {ok: false, erreur: 'responsable'};
        PropertiesService.getScriptProperties().deleteProperty('membre:' + cle(op.nom));
        membresChange = true;
        return {ok: true};
      }
      const id = String(op.id || '');
      if (!/^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(id)) return {ok: false, erreur: 'requete'};
      if (op.op === 'set') {
        if (!estObjet(op.data)) return {ok: false, erreur: 'requete'};
        contacts.set(id, signer(op.data, contacts.get(id), auteur)); contactsChange = true;
        return {ok: true};
      }
      if (op.op === 'update') {
        if (!estObjet(op.data)) return {ok: false, erreur: 'requete'};
        if (!contacts.has(id)) return {ok: false, erreur: 'absent'};
        contacts.set(id, Object.assign({}, contacts.get(id), signer(op.data, contacts.get(id), auteur))); contactsChange = true;
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
    const rev = (contactsChange || config || membresChange) ? nouvelleRev() : revActuelle();
    return json({ok: true, rev: rev, resultats: resultats});
  } finally {
    verrou.releaseLock();
  }
}

/* ---------- Membres et codes personnels ---------- */
function cle(nom) {
  return String(nom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function empreinte(sel, pin) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sel + ':' + pin)
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function lireMembre(nom) {
  const v = PropertiesService.getScriptProperties().getProperty('membre:' + cle(nom));
  try { return v ? JSON.parse(v) : null; } catch (err) { return null; }
}
function ecrireMembre(m) { PropertiesService.getScriptProperties().setProperty('membre:' + cle(m.nom), JSON.stringify(m)); }
function listeMembres() {
  const p = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(p).filter(k => k.indexOf('membre:') === 0).map(k => { try { return JSON.parse(p[k]).nom; } catch (err) { return null; } }).filter(Boolean);
}
function inscrireMembre(nom, pin) {
  nom = String(nom || '').trim().replace(/\s+/g, ' ');
  if (nom.length < 3 || nom.length > 80) return {ok: false, erreur: 'nom'};
  if (!/^\d{4,8}$/.test(String(pin || ''))) return {ok: false, erreur: 'pin_format'};
  if (lireMembre(nom)) return {ok: false, erreur: 'existe'};
  const sel = Utilities.getUuid();
  ecrireMembre({nom: nom, sel: sel, h: empreinte(sel, pin), echecs: 0, bloque: 0});
  return {ok: true, nom: nom};
}
/* 5 codes faux de suite : le nom est bloqué 15 minutes */
function verifierMembre(nom, pin) {
  const m = lireMembre(nom);
  if (!m) return {ok: false, erreur: 'inconnu'};
  if ((m.bloque || 0) > Date.now()) return {ok: false, erreur: 'bloque'};
  if (empreinte(m.sel, String(pin || '')) === m.h) {
    if (m.echecs) { m.echecs = 0; ecrireMembre(m); }
    return {ok: true, nom: m.nom};
  }
  m.echecs = (m.echecs || 0) + 1;
  if (m.echecs >= 5) { m.echecs = 0; m.bloque = Date.now() + 15 * 60000; }
  ecrireMembre(m);
  return {ok: false, erreur: m.bloque > Date.now() ? 'bloque' : 'pin'};
}
/* Le serveur inscrit lui-même l'auteur : impossible de noter un appel au nom d'un autre */
function signer(data, avant, auteur) {
  const d = Object.assign({}, data);
  if ('par' in d) d.par = auteur;
  if (Array.isArray(d.hist)) {
    const connus = {};
    ((avant && avant.hist) || []).forEach(h => { if (h) connus[[h.t, h.s, h.m].join('|')] = h.p; });
    d.hist = d.hist.map(h => {
      if (!h || typeof h !== 'object') return h;
      const k = [h.t, h.s, h.m].join('|');
      return Object.assign({}, h, {p: k in connus ? connus[k] : auteur});
    });
  }
  return d;
}
/* Objectif, lien de don et responsable : seul le responsable les change ; le premier responsable se désigne lui-même */
function configAutorisee(avant, apres, auteur) {
  /* Une valeur jamais enregistrée peut être posée une première fois (réglages par défaut du site) */
  const pareil = k => avant[k] === undefined || JSON.stringify(avant[k]) === JSON.stringify(apres[k] === undefined ? null : apres[k]);
  const respAvant = String(avant.responsable || ''), respApres = String(apres.responsable || '');
  if (respAvant) return (pareil('lien') && pareil('objectif') && cle(respApres) === cle(respAvant)) || cle(respAvant) === cle(auteur);
  return pareil('lien') && pareil('objectif') && (!respApres || cle(respApres) === cle(auteur));
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
