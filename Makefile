.PHONY: test benchmark-local-project


test:
	NODE_PATH=./node_modules node ./test-runner/run-local-arch-benchmark.js

benchmark-local-project:
	@if [ -z "$(PROJECT)" ]; then \
		echo "Usage: make benchmark-local-project PROJECT=/abs/or/relative/path [LEVEL=overview|standard|detailed] [PARSER=treesitter|lsp]"; \
		exit 1; \
	fi
	NODE_PATH=./node_modules node ./test-runner/run-local-arch-benchmark.js --repo "$(PROJECT)" --level "$(or $(LEVEL),detailed)" --parser "$(or $(PARSER),treesitter)"
