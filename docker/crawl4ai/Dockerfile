# Pinned upstream server includes Chromium, authenticated API, and guarded browser egress.
FROM unclecode/crawl4ai:0.9.5@sha256:0b05666882bfb67f45d559a5b827839c54127b74aedd723f8ab338a3571b5fc9
USER root
# Match the existing full-import budget instead of silently clamping it to 100 pages.
RUN python3 - <<'PY'
import yaml
path = '/app/config.yml'
with open(path) as source:
    config = yaml.safe_load(source)
config['limits'].update(max_pages=10000, max_depth=12, wall_clock_s=1800)
config['limits']['queue'].update(workers=1, maxsize=20)
config['crawler']['pool']['max_pages'] = 4
with open(path, 'w') as target:
    yaml.safe_dump(config, target)
PY
USER appuser
ENV CRAWL4AI_ALLOW_DEEP_CRAWL=true
EXPOSE 11235
