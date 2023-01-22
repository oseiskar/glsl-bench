
import numpy, scipy.misc

TEX_RES = 2*1024

def star_texture():

    sz = (TEX_RES,TEX_RES*2)

    zero = numpy.zeros(sz)
    brightness = zero*0
    temperature = zero*0

    y = numpy.linspace(0, 1, TEX_RES)
    prob = 5.0 / TEX_RES * numpy.cos((y-0.5)*numpy.pi)
    prob = prob[:,numpy.newaxis]

    s = numpy.random.uniform(size=sz)

    brightness = (s / prob)*(s < prob)
    temperature = (s < prob)*numpy.random.uniform(size=sz)
    return numpy.dstack((brightness, temperature, zero))

def accretion_disk_texture():

    x = numpy.linspace(0, 1, TEX_RES)[numpy.newaxis, :]
    y = numpy.linspace(0, 1, TEX_RES/4)[:, numpy.newaxis]

    s = x*numpy.exp(-x*4.0)*(1.0-x) * ((numpy.sin(x*numpy.pi*20)+1.0)*0.5) ** 0.1 * 20.0
    s = s * (1 - numpy.fmod(numpy.ceil(y*50),2)*0.3)

    return numpy.dstack((s,s,s))

def beach_ball_texture():

    x = numpy.linspace(0, 1, 512)[numpy.newaxis, :]
    y = numpy.linspace(0, 1, 512)[:, numpy.newaxis]

    W, H = (8, 2)

    ix = numpy.floor(x*W)
    iy = numpy.floor(y*H)

    s = 1 - numpy.fmod(ix + iy, 2) * 0.5
    return numpy.dstack((s,s,s))

def save_img(filename, data):
    import PIL.Image
    bytedata = (numpy.clip(data, 0, 1)*255).astype(numpy.uint8)
    PIL.Image.fromarray(bytedata).save(filename)

save_img('stars.png', star_texture())
save_img('accretion-disk.png', accretion_disk_texture())
save_img('beach-ball.png', beach_ball_texture())
