import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AppImage from './AppImage.vue'

describe('AppImage', () => {
  it('replaces a failed image with a retryable state', async () => {
    const wrapper = mount(AppImage, { props: { src: 'https://example.com/device.jpg', alt: '测试设备' } })
    await wrapper.get('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('图片加载失败')

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    expect(wrapper.find('img').exists()).toBe(true)
  })

  it('does not render unsafe image schemes', () => {
    const wrapper = mount(AppImage, { props: { src: 'javascript:alert(1)' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('暂无图片')
  })
})
