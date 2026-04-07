.PHONY: test


test:
	NODE_PATH=./node_modules node ./test-runner/run-local-arch-benchmark.js
