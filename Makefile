all: update

update: 
	./rezip.sh track-changes
	# wsk -i action update /guest/test track-changes.zip --kind  nodejs:10track-changes --track-changes true
	 wsk -i action update /guest/sharelatex/track-changes track-changes.zip --kind  nodejs:10 --web raw

