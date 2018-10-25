all: dist/blockparty-wallet.js \
	 dist/blockparty-wallet.css

release: dist/blockparty-wallet.min.js \
		 dist/blockparty-wallet.min.css

lint:
	./node_modules/.bin/eslint src/main.js

dist/blockparty-wallet.js: src/main.js \
						   src/templates/wallet.html \
						   src/templates/action_received.html \
						   src/templates/action_sent.html
	browserify -t brfs $< > $@

dist/blockparty-wallet.css: src/fixed.css dist/tmp.prefixed.css 
	cat $^ > $@

dist/tmp.prefixed.css: dist/tmp.css
	prefix-css "#blockparty-wallet" $^ > $@

dist/tmp.css: node_modules/materialize-css/dist/css/materialize.min.css \
			  node_modules/simplebar/dist/simplebar.min.css \
			  src/app.css
	cat $^ > $@

dist/blockparty-wallet.min.js: dist/blockparty-wallet.js
	uglifyjs $< > $@

dist/blockparty-wallet.min.css: dist/blockparty-wallet.css
	uglifycss $< > $@

.PHONY: clean
clean:
	rm dist/*
