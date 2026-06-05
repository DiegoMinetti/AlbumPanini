import { runEnrich } from './enrich.js';
import { generateReport } from './report.js';

// CLI del pipeline.
//   pnpm enrich                      enriquecimiento completo (desde cero)
//   pnpm enrich --resume             continúa desde el último checkpoint
//   pnpm enrich --player "Nombre"    enriquece un solo jugador (debug, sin escribir)
//   pnpm report                      regenera enrichment-report.json

interface Args {
  command: string;
  resume: boolean;
  player?: string;
}

function parseArgs(argv: string[]): Args {
  const [command = 'enrich', ...rest] = argv;
  const args: Args = { command, resume: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--resume') args.resume = true;
    else if (a === '--player') args.player = rest[++i];
  }
  return args;
}

const log = (msg: string) => console.log(msg);

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  switch (args.command) {
    case 'enrich': {
      await runEnrich({
        resume: args.resume,
        singlePlayer: args.player,
        log,
      });
      if (!args.player) {
        const report = await generateReport();
        log('');
        log('=== Reporte ===');
        log(JSON.stringify(report, null, 2));
      }
      break;
    }
    case 'report': {
      const report = await generateReport();
      log(JSON.stringify(report, null, 2));
      break;
    }
    default:
      log(`Comando desconocido: ${args.command}`);
      log('Uso: enrich [--resume] [--player "Nombre"] | report');
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
