.PHONY: test


test:
	NODE_PATH=./node_modules node ../tests/realworld/test-runner/run-local-arch-benchmark.js
