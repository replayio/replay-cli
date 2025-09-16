import { beforeAll } from 'vitest'
import { setProjectAnnotations } from '@storybook/react-vite'
import * as projectAnnotations from './preview'

// This sets up Storybook for the Vitest environment
beforeAll(async () => {
  setProjectAnnotations(projectAnnotations)
}) 