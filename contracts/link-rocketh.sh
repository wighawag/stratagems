#!/usr/bin/env bash
# link a local rocketh checkout's packages, to develop rocketh against stratagems
ROCKETH=${ROCKETH:-~/dev/github/wighawag/rocketh}
for package in rocketh hardhat-deploy rocketh-node rocketh-deploy rocketh-proxy rocketh-router rocketh-read-execute rocketh-signer rocketh-viem rocketh-doc rocketh-export rocketh-verifier; do
	pnpm link "$ROCKETH/packages/$package"
done
