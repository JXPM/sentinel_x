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
git commit -m "Ajout de obsidian"
git push origin ia 


#commande test webcam
 python detect.py --conf 0.3      # plus sensible (plus de détections, plus de faux positifs)
  python detect.py --confirm 5     # alerte plus lente mais plus sûre
  python detect.py --source 1      # autre webcam (/dev/video1)