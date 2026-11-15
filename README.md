# Appels Shoresh 2026

Outil d'appels pour la campagne de dons Shoresh 2026 : liste de contacts commune à toute l'équipe, résultat de chaque appel, rappels, relances des promesses, compteur par appelant et détail des dons.

- Le site est dans `docs/` et se publie avec GitHub Pages.
- La liste commune est enregistrée dans un Google Sheet, grâce au script `google-apps-script/Code.gs`.
- L'accès est protégé par un code d'équipe, vérifié par le script Google.

## Installation

### 1. Le Google Sheet

1. Crée un Google Sheet vide (par exemple sur sheets.new) et nomme-le « Appels Shoresh 2026 ».
2. Menu **Extensions → Apps Script**. Efface le code présent et colle tout le contenu de `google-apps-script/Code.gs`.
3. Ligne `const CODE_EQUIPE = 'a-changer';` : remplace `a-changer` par le code que tu donneras aux appelants. Choisis-en un difficile à deviner.
4. Enregistre (icône disquette).
5. **Déployer → Nouveau déploiement**. Roue dentée → **Application Web**.
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**
6. **Déployer**, puis **Autoriser l'accès** avec ton compte Google. Google affiche « Application non validée » : clique sur **Paramètres avancés**, puis **Accéder à … (non sécurisé)**. C'est ton propre script.
7. Copie l'**URL de l'application Web**. Elle finit par `/exec`.

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
- Personne ne voit un contact sans le code d'équipe. Pour changer le code, modifie-le dans le script, redéploie une nouvelle version, et donne le nouveau code à l'équipe.
