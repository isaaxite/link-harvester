import { LinkHarvester } from '../index';

async function main() {
  const base = '/home/isaac/Workspace/blog/source/_drafts/';
  const filePath = '英语学习/标注 | 局外人 | Pt. 1, Ch. 3.md';
  const harvester = new LinkHarvester(base);
  const ret = await harvester.localAssets(filePath);

  process.exit(0);
}

main().catch(console.error);