# ai-scout-pictures

Demo of some uses of semantic searching of pictures.

This repo contains code that has been copied from a succession of exploratory demos, so there is dead code inherited from those demos. When I come across it, I'll delete it.

The Java programs loaded data into a SOLR index, the web server runs a simple demo search.

## Java programs

LoadPictures loads the pictures and openAI vision descriptions created by Francis into SOLR.  I ran it twice: on a directory of ~200 images and then on a directory of ~5000 images I got from Francis.

 HarvestPictures and LoadPictures2 were an initial attempt to find images to load from Blacklight, get them from the NLA web site (HarvestPictures) and load them into SOLR (LoadPictures2) as separate non-overlapping processes.  The problem encountered was that retrieving the actual images was very slow. This led to a complete replacement approach, HarvestAndLoadPictures which did these things in parallel.

HarvestAndLoadPictures has a main thread that finds images in Blacklight.  This is fast.  It starts multiple threads to retrieve the image from the nla web site (DLIR? whatever) which is slow, and a single thread to create CLIP embeddings and load into SOLR (which is fast).

## Web server

Typical node server.  Uses https because it makes sooky browsers complain less.  But github frets about even self-signed certs for localhost being exposed, so you'll have to recreate them yourself, something like:

`(base) kfitch@hinton:~/pictures/web$ openssl genrsa -out key.pem
(base) kfitch@hinton:~/pictures/web$ openssl req -new -key key.pem -out csr.pem
You are about to be asked to enter information that will be incorporated
into your certificate request.
What you are about to enter is what is called a Distinguished Name or a DN.
There are quite a few fields but you can leave some blank
For some fields there will be a default value,
If you enter '.', the field will be left blank.
-----
Country Name (2 letter code) \[AU\]:
State or Province Name (full name) \[Some-State\]:ACT
Locality Name (eg, city) \[\]:Canberra
Organization Name (eg, company) \[Internet Widgits Pty Ltd\]:NLA
Organizational Unit Name (eg, section) \[\]:Digital
Common Name (e.g. server FQDN or YOUR name) \[\]:hinton.nla.gov.au
Email Address \[\]:kfitch@nla.gov.au

Please enter the following 'extra' attributes
to be sent with your certificate request
A challenge password \[\]:
An optional company name \[\]:
(base) kfitch@hinton:~/pictures/web$ openssl x509 -req -days 360 -in csr.pem -signkey key.pem -out cert.pem
Certificate request self-signature ok
subject=C = AU, ST = ACT, L = Canberra, O = NLA, OU = Digital, CN = hinton.nla.gov.au, emailAddress = kfitch@nla.gov.au
(base) kfitch@hinton:~/pictures/web$`

This creates these files:

key.pem csr.pem cert.pem

The .env file defines the TCP port the node server will listen on, and how it can find SOLR and an embedding service.  Like the load programs, it must use CLIP to create embeddings from the queries so it can search SOLR for similar embeddings.

run webserver like this

`node app.js`




## SOLR schema

See SOLRschemas/managed-schema.xml

Because I'm not sure what the best approach is, lots of things are tried, and weightings exposed in the web UI.
