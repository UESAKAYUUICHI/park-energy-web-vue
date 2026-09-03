import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppDialog from './AppDialog.vue'

describe('AppDialog', () => {
  it('shows the save and cancel actions by default', async () => {
    const wrapper = mount(AppDialog, {
      props: { open: true, title: '新增计费账户' },
    })

    const buttons = wrapper.findAll('button')
    expect(wrapper.text()).toContain('保存')
    expect(wrapper.text()).toContain('取消')

    await buttons.find((button) => button.text() === '保存')?.trigger('click')
    expect(wrapper.emitted('submit')).toHaveLength(1)
  })

  it('hides the footer only when explicitly requested', () => {
    const wrapper = mount(AppDialog, {
      props: { open: true, title: '只读详情', showFooter: false },
    })

    expect(wrapper.text()).not.toContain('保存')
    expect(wrapper.text()).not.toContain('取消')
  })
})
