# cant run llm and phi vision at the same time, but people may be using llm during the day
# so at 6pm Mon to Fri, stop vllm then start phiVision and issue request to resume vision indexing
#
systemctl stop vllm
sleep 5
systemctl start microsoftPhi3Vision
sleep 30

cd /home/kfitch/pictures/web
wget --no-check-certificate "https://hinton.nla.gov.au:5550/admin/generateDescriptionAndnswfUsingMsVision" -O  visionGenLog9 &
