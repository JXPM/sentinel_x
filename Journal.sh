# commande pour clone un repo github
gh repo clone JXPM/sentinel_x


# Créer un nouveau dépôt GitHub 
git init
git branch -M main
git add .
git commit -m "first commit"
gh repo create sentinel_x --public
git remote add origin https://github.com/JXPM/sentinel_x.git
git push --set-upstream origin main

#fichier Maj et push
git status
git add .
git commit -m "maj sh"
git push origin main




Je réalise un Saas de restauration et bar. Je veux permettre de passer commande et de payer les commandes via MTNMoney et aussi ermettre au proprio de bar de payer leur abonnement au Saas via MTNMoney également

