import CoreGraphics

enum PlayerPortraitCrop {
    static func trim(_ image: CGImage) -> CGImage {
        guard image.alphaInfo != .none, image.alphaInfo != .noneSkipFirst, image.alphaInfo != .noneSkipLast,
              let mask = CGContext(data: nil, width: image.width, height: image.height, bitsPerComponent: 8,
                                   bytesPerRow: image.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue),
              let bytes = mask.data?.assumingMemoryBound(to: UInt8.self) else { return image }
        mask.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))

        var top = image.height
        var left = image.width
        var right = -1
        var bottom = -1
        for y in 0..<image.height {
            for x in 0..<image.width where bytes[y * mask.bytesPerRow + x * 4 + 3] >= 32 {
                top = min(y, top)
                bottom = max(y, bottom)
                left = min(x, left)
                right = max(x, right)
            }
        }
        guard right > left, bottom > top else { return image }
        let padding = max(2, min(right - left, bottom - top) / 32)
        let bounds = CGRect(x: left - padding, y: top - padding,
                            width: right - left + 1 + 2 * padding, height: bottom - top + 1 + 2 * padding)
            .intersection(CGRect(x: 0, y: 0, width: image.width, height: image.height))
        return image.cropping(to: bounds) ?? image
    }
}
