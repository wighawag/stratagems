#!/usr/bin/env bash
git checkout $1 && git merge main && git push && git checkout main && git push
