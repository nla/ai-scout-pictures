#!/bin/bash
umask 0002
echo "About to start pictures node as a service, shell is $0"
date
cd /home/kfitch/pictures/web
# this export lets our node call itself without axios freaking out about self signed certs
export NODE_TLS_REJECT_UNAUTHORIZED='0'
node app.js >> log-node 2>&1
echo "Ended pictures node as a service"
date
