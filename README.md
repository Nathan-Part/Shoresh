# Appels Shoresh 2026

Outil d'appels pour la campagne de dons Shoresh 2026 : liste de contacts commune à toute l'équipe, résultat de chaque appel, rappels, relances des promesses, compteur par appelant et détail des dons.

- Le site est dans `docs/` et se publie avec GitHub Pages.
- La liste commune est enregistrée dans un Google Sheet, grâce au script `google-apps-script/Code.gs`.
- L'accès est protégé par un code d'équipe, vérifié par le script Google.

## Installation

### 1. Le script Google

1. Ouvre **script.new** (connecté à ton compte Google). Sur téléphone, passe d'abord le navigateur en « version pour ordinateur ».
2. Efface le code présent et colle tout le contenu de `google-apps-script/Code.gs`, sans rien modifier.
3. Enregistre (icône disquette).
4. **Déployer → Nouveau déploiement**. Roue dentée → **Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
5. **Déployer**, puis **Autoriser l'accès** avec ton compte Google. Google affiche « Application non validée » : clique sur **Paramètres avancés**, puis **Accéder à … (non sécurisé)**. C'est ton propre script.
6. Copie l'**URL de l'application Web**. Elle finit par `/exec`.

Le premier code d'équipe entré sur le site devient le code de l'équipe. Le tableur « Appels Shoresh 2026 (liste) » est créé dans ton Google Drive au même moment. Pour changer le code : dans le script, **Paramètres du projet → Propriétés du script → code**.

Chaque membre choisit un **code personnel** (4 à 8 chiffres) à sa première connexion. Le script refuse toute modification faite au nom de quelqu'un sans son code, inscrit lui-même le vrai auteur de chaque appel, et bloque un nom 15 minutes après 5 codes faux. Seul le responsable de la campagne modifie l'objectif et le lien de don, et peut donner un nouveau code personnel à un membre (onglet Équipe). Code personnel du responsable oublié : dans le script, **Paramètres du projet → Propriétés du script**, supprime la ligne `membre:prénom nom`.

Si tu modifies le script plus tard : **Déployer → Gérer les déploiements → Modifier (crayon) → Version : Nouvelle version**. L'URL ne change pas.

### 2. Le site sur GitHub Pages

1. Sur GitHub, dépôt Shoresh : **Settings → General → Danger Zone → Change visibility → Public**.
2. **Settings → Pages** : Source **Deploy from a branch**, branche `claude/eloquent-thompson-o3ww12`, dossier `/docs`, puis **Save**.
3. Après une ou deux minutes, le site est en ligne sur `https://nathan-part.github.io/Shoresh/`.

### 3. Relier le site au Google Sheet

Mets l'URL du script dans la constante `API_URL` de `docs/index.html`. Pour tester avant, ouvre une fois le site avec l'adresse du script dans le lien : `https://nathan-part.github.io/Shoresh/?api=URL_DU_SCRIPT`. L'appareil la retient.

## Bon à savoir

- Ne modifie pas la feuille « Contacts » à la main : le site lit la colonne `data`. Les autres colonnes servent à lire la liste dans Google Sheets.
- Les autres téléphones voient les changements en 12 secondes au plus.
- Personne ne voit un contact sans le code d'équipe.
