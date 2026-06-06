# ============================================================
# CricZodiac — PHP 8.2 + Nginx + Supervisor
# ============================================================

FROM php:8.2-fpm-alpine

LABEL maintainer="Zodiac Technologies <admin@zodiactech.net>"
LABEL description="CricZodiac Backend API"

# Install system packages
RUN apk add --no-cache \
    nginx \
    supervisor \
    libpng-dev \
    libjpeg-turbo-dev \
    libwebp-dev \
    freetype-dev \
    icu-dev \
    oniguruma-dev \
    && docker-php-ext-configure gd \
        --with-freetype \
        --with-jpeg \
        --with-webp \
    && docker-php-ext-install -j$(nproc) \
        pdo \
        pdo_mysql \
        gd \
        opcache \
        exif \
        intl \
        mbstring

# PHP production config
RUN cp /usr/local/etc/php/php.ini-production /usr/local/etc/php/php.ini

# PHP overrides
RUN { \
    echo "upload_max_filesize = 10M"; \
    echo "post_max_size = 12M"; \
    echo "max_execution_time = 60"; \
    echo "memory_limit = 256M"; \
    echo "expose_php = Off"; \
    echo "display_errors = Off"; \
    echo "log_errors = On"; \
    echo "error_log = /var/www/html/logs/php_errors.log"; \
} > /usr/local/etc/php/conf.d/criczodiac.ini

# OPcache
RUN { \
    echo "opcache.enable = 1"; \
    echo "opcache.memory_consumption = 128"; \
    echo "opcache.max_accelerated_files = 4000"; \
    echo "opcache.revalidate_freq = 60"; \
    echo "opcache.fast_shutdown = 1"; \
} > /usr/local/etc/php/conf.d/opcache.ini

# PHP-FPM: listen on 127.0.0.1:9000
RUN sed -i 's|listen = /run/php/php8.2-fpm.sock|listen = 127.0.0.1:9000|g' \
    /usr/local/etc/php-fpm.d/www.conf 2>/dev/null || true

# Nginx config
COPY nginx/default.conf /etc/nginx/http.d/default.conf

# Remove default nginx config
RUN rm -f /etc/nginx/http.d/default_simple.conf 2>/dev/null || true

# Supervisor
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# App directory
WORKDIR /var/www/html

# Copy application code
COPY --chown=www-data:www-data . .

# Create required directories
RUN mkdir -p uploads/profiles logs \
    && chown -R www-data:www-data uploads logs \
    && chmod -R 755 uploads logs \
    && chmod -R 644 $(find . -name "*.php") 2>/dev/null || true

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/health || exit 1

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
