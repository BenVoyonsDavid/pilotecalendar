# HoraireTeams v1.0.0

Version source finale de HoraireTeams v1.0.0.

## Fonctionnalités incluses

- Interface React/TypeScript FR/EN.
- Horaire par affectations et vue par employé.
- Semaines A/B, exceptions ponctuelles et couverture minimale.
- Absences, vacances et télétravail avec approbation.
- Équipes, rôles et permissions côté interface.
- Forfaits Gratuit / Équipe / Entreprise dans le produit.
- Modèle vierge pour une nouvelle organisation; la démo Technocentre reste disponible volontairement.
- Intégration Microsoft Teams (`@microsoft/teams-js`).
- Backend Node/Express + SDK Teams pour bot et messages proactifs.
- Notifications quotidiennes vers un canal Teams avec heure, jours, langue et contenu configurables.
- Bouton d’envoi immédiat pour validation du canal lié.
- Authentification API Microsoft Entra activable et sécurisée par défaut en production.
- Manifeste Teams 1.30 et générateur de package Teams.
- Pages Confidentialité, Conditions et Soutien à compléter avec l’identité légale de l’éditeur avant publication.

## Développement local

Copier le modèle d’environnement :

```powershell
Copy-Item .\env\.env.example .\.env
```

Pour un test local uniquement, définir :

```env
NODE_ENV=development
AUTH_MODE=development
TEAMS_ALLOW_UNAUTHENTICATED=true
```

Puis :

```powershell
npm.cmd install
npm.cmd run dev
```

Web : `http://localhost:5173`  
API : `http://localhost:3978`  
Health : `http://localhost:3978/health`

## Production

En production :

```env
NODE_ENV=production
AUTH_MODE=entra
TEAMS_ALLOW_UNAUTHENTICATED=false
```

Renseigner aussi les vraies valeurs `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`, `PUBLIC_DOMAIN` et `APPLICATION_ID_URI`.

Compiler :

```powershell
npm.cmd run build
npm.cmd start
```

Le serveur sert le frontend compilé et le bot/API sur le même hôte.

## Générer le ZIP Teams

Une fois les vrais identifiants Microsoft et le domaine disponibles :

```powershell
npm.cmd run teams:package -- app.votredomaine.ca <TEAMS_APP_ID> <CLIENT_ID>
```

Le fichier produit sera :

```text
release/HoraireTeams-TeamsApp.zip
```

C’est ce petit ZIP (`manifest.json`, `color.png`, `outline.png`) qui sert à l’installation/soumission Teams, pas le ZIP source complet.

## Vérification avant publication

```powershell
npm.cmd run release:check
```

Consulter `docs/PRODUCTION-CHECKLIST.md` et `SECURITY.md`.

## Limites à finaliser avec l’infrastructure externe

Le code v1.0.0 est emballé comme version finale de cette itération, mais une publication publique multi-client nécessite encore les ressources externes que le code ne peut pas créer seul : domaine HTTPS, App Registration/bot Microsoft, stockage de production multi-tenant, autorisation serveur complète, identité légale/support, et configuration Marketplace/SaaS.
