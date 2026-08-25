import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Enforce types that map to our change taxonomy
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'ci', 'perf', 'revert'],
    ],
    // Scope must be a known workspace package or a gate name
    'scope-enum': [
      1,
      'always',
      [
        'api',
        'matching',
        'admin',
        'mobile-consumer',
        'mobile-driver',
        'contracts',
        'ui',
        'config',
        'infra',
        'docs',
        'ci',
        'deps',
        'gate-d',
        'phase-0',
      ],
    ],
    'subject-case': [2, 'always', 'lower-case'],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 120],
    'footer-max-line-length': [1, 'always', 120],
  },
};

export default config;
