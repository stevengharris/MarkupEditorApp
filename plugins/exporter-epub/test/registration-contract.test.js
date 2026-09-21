// @vitest-environment jsdom
import path from 'node:path'
import { registrationContract } from 'markupeditor-plugin-kit/testing/contract'

registrationContract(path.resolve(import.meta.dirname, '..'))
