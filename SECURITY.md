# Security

HoraireTeams v1.0.0 doit être déployé avec `NODE_ENV=production`, `AUTH_MODE=entra` et `TEAMS_ALLOW_UNAUTHENTICATED=false`.

Ne jamais committer `CLIENT_SECRET`, jetons, certificats ou fichiers `.env` de production. Utiliser un gestionnaire de secrets de la plateforme d’hébergement.

Le stockage JSON fourni est destiné au développement et aux essais contrôlés. Un déploiement public multi-organisation doit utiliser un stockage persistant isolé par tenant/organisation et appliquer l’autorisation côté serveur.
