# HoraireTeams v1.0.0 – Checklist de publication

## Obligatoire avant soumission Teams Store / Marketplace

- [ ] Héberger le frontend et le backend sur un domaine HTTPS public stable.
- [ ] Créer/configurer l’application Microsoft Entra et le bot Teams de production.
- [ ] Remplir `.env` avec `CLIENT_ID`, `CLIENT_SECRET`, `TENANT_ID`, `PUBLIC_DOMAIN` et `APPLICATION_ID_URI`.
- [ ] Garder `NODE_ENV=production`, `AUTH_MODE=entra` et `TEAMS_ALLOW_UNAUTHENTICATED=false`.
- [ ] Configurer l’application Entra pour le scénario de publication public/multi-organisation choisi.
- [ ] Remplacer le stockage JSON par un stockage de production isolé par organisation/tenant avant ouverture à plusieurs clients.
- [ ] Mettre en place les contrôles d’autorisation serveur correspondant aux rôles applicatifs.
- [ ] Publier l’identité légale de l’éditeur, les coordonnées de soutien et les politiques finales de confidentialité/conservation/suppression.
- [ ] Remplir les informations Partner Center et, si applicable, connecter l’offre SaaS/licences.
- [ ] Générer le package Teams avec `npm.cmd run teams:package -- <domain> <teams-app-id> <client-id>`.
- [ ] Valider le manifeste et tester installation, SSO, onglet, bot et notifications dans au moins deux équipes/tenants de test.
- [ ] Exécuter `npm.cmd run release:check` avant soumission.

## Important

Le ZIP source v1.0.0 est la version finale du code de cette itération. Le package à téléverser dans le Teams Store ne peut être finalisé qu’après attribution des vrais IDs Microsoft et du domaine de production.
