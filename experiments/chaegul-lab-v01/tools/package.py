from pathlib import Path
import re,zipfile,hashlib,json
root=Path(__file__).resolve().parents[1];out=root/'artifacts';out.mkdir(exist_ok=True)
h=(root/'index.html').read_text();h=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',h);h=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+ (root/m[1]).read_text().replace('</script','<\\/script')+'</script>',h)
single=out/'chaegul-gongbang-lab-v0.1-single.html';single.write_text(h)
archive=out/'chaegul-gongbang-lab-v0.1-project.zip';paths=[root/'index.html',root/'README.md',root/'package.json']
for d in ['src','docs','tests','tools','evidence']:paths+=sorted(p for p in (root/d).rglob('*') if p.is_file() and p.name!='failure.png')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for p in paths+[single]:
  if p.exists():
   name=p.name if p==single else p.relative_to(root).as_posix();i=zipfile.ZipInfo('chaegul-gongbang-lab-v0.1/'+name,date_time=(2026,10,17,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,p.read_bytes())
with zipfile.ZipFile(archive) as z:assert z.testzip() is None
m={p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [single,archive]};(out/'SHA256SUMS.json').write_text(json.dumps(m,indent=2));print(json.dumps(m,indent=2))
