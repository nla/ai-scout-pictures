# cant run llm and phi vision at the same time, so stop vision at 8am Mon-Fri and start vllm
# also restart pictures server to kill vision indexing request

#
systemctl stop microsoftPhi3Vision
sleep 5
systemctl restart picturesNode
sleep 5
# vllm wont start if the other GPU embedding jobs are running - seems to need temporairly more memory at start..
# so shut them
#
systemctl stop bgeBaseEmbedding
systemctl stop nomicBaseEmbedding.service
sleep 5
systemctl start vllm
sleep 20
systemctl start bgeBaseEmbedding
systemctl start nomicBaseEmbedding.service

